// Synthesise narration audio for a node.
//
// Reads the node's title + caption and an Edge "voice" (a concrete Edge neural
// voice ShortName, e.g. zh-CN-XiaoxiaoNeural), then writes an audio file at
// paths.audioPath(canvasId, hash, 'mp3'). Failure is non-fatal: callers receive
// { ok: false, reason } and keep the node as-is — audio never blocks image
// generation.
//
// One provider: Microsoft Edge online neural voices (msedge-tts). Free, no API
// key, but needs network. Natural-sounding; writes .mp3. There is no offline
// fallback: if Edge is unreachable the node simply has no audio.
//
// The list of selectable voices comes straight from Edge's online catalogue
// (listVoices), filtered to the current UI language. We keep a small built-in
// whitelist (FALLBACK_VOICES) so the picker is never empty when offline.

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { paths } from '../store/paths.js';
import { normalizeLang } from './language.js';
import { log } from '../lib/log.js';

// The default voice per language, used when no voice is pinned or the pinned
// value isn't available (e.g. an old flipbook that stored a legacy mood).
export const DEFAULT_VOICE = Object.freeze({
  zh: 'zh-CN-XiaoxiaoNeural',
  en: 'en-US-AriaNeural',
});

// Locale prefix used to filter Edge's catalogue per UI language.
const LANG_LOCALE = Object.freeze({ zh: 'zh-CN', en: 'en-US' });

// Built-in minimal whitelist used when getVoices() fails (offline / blocked),
// so the UI picker and tests still have a non-empty list to work with.
const FALLBACK_VOICES = Object.freeze({
  zh: ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunyangNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunjianNeural'],
  en: ['en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-DavisNeural', 'en-US-TonyNeural'],
});

// Chinese display names for the common zh voice characters, so the picker
// reads "晓晓 · 女声" instead of Edge's verbose "Microsoft Xiaoxiao Online
// (Natural) - Chinese (Mainland)". Unknown characters fall back to the latin
// name parsed from the ShortName.
const ZH_VOICE_NAMES = Object.freeze({
  Xiaoxiao: '晓晓', Xiaoyi: '晓伊', Yunjian: '云健', Yunxi: '云希',
  Yunxia: '云夏', Yunyang: '云扬', Xiaobei: '晓贝', Xiaoni: '晓妮',
  Yunfeng: '云枫', Yunhao: '云皓', Xiaochen: '晓辰', Xiaohan: '晓涵',
  Xiaomeng: '晓梦', Xiaomo: '晓墨', Xiaoqiu: '晓秋', Xiaorui: '晓睿',
  Xiaoshuang: '晓双', Xiaoxuan: '晓萱', Xiaoyan: '晓颜', Xiaoyou: '晓悠',
  Xiaozhen: '晓甄', Yunye: '云野', Yunze: '云泽',
});

// Region label derived from the locale suffix, shown when a voice isn't the
// plain Mainland Mandarin one (e.g. "东北" / "中原" / "粤语").
const ZH_REGION = Object.freeze({
  'zh-CN-liaoning': '东北', 'zh-CN-shaanxi': '陕西', 'zh-CN-henan': '中原',
  'zh-CN-shandong': '山东', 'zh-CN-sichuan': '四川', 'zh-HK': '粤语',
  'zh-TW': '台湾', 'zh-MO': '澳门',
});

// Build a short, readable label for a voice from its ShortName / Gender /
// Locale. zh voices read "晓晓 · 女声 (东北)"; others read "Aria · Female".
function prettifyVoiceName(shortName, gender, locale) {
  // ShortName looks like "zh-CN-XiaoxiaoNeural" or "zh-CN-liaoning-XiaobeiNeural".
  const m = /([A-Za-z]+)Neural$/.exec(shortName || '');
  const latin = m ? m[1] : (shortName || '');
  const isZh = typeof locale === 'string' && locale.startsWith('zh');
  const name = isZh ? (ZH_VOICE_NAMES[latin] || latin) : latin;
  const region = ZH_REGION[locale];
  let label = name;
  if (gender) {
    if (isZh) label += gender === 'Male' ? ' · 男声' : ' · 女声';
    else label += gender === 'Male' ? ' · Male' : ' · Female';
  }
  if (region) label += ` (${region})`;
  return label;
}

// Detect zh vs en from a node's prose. Nodes don't persist the `lang` they
// were generated with, so re-synthesis (and any caller without a lang in
// hand) infers it: any CJK character ⇒ Chinese, otherwise English.
export function detectLang(...texts) {
  const joined = texts.filter((t) => typeof t === 'string').join(' ');
  return /[\u3400-\u9FFF\uF900-\uFAFF\u3040-\u30FF]/.test(joined) ? 'zh' : 'en';
}

// Strip markdown / emoji / control chars so the synthesiser reads clean prose.
// Also collapses whitespace and trims to a sane length.
export function sanitizeForSpeech(text, maxLen = 600) {
  if (!text || typeof text !== 'string') return '';
  let s = text;
  s = s.replace(/```[\s\S]*?```/g, ' ');         // fenced code
  s = s.replace(/`([^`]*)`/g, '$1');             // inline code
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'); // links / images → label
  s = s.replace(/[*_~#>|]/g, ' ');               // md emphasis / headings / quotes / tables
  s = s.replace(/\[\[[^\]]*\]\]/g, ' ');         // any stray say-style [[...]] directives
  // Drop emoji / pictographic symbols (keep CJK + latin + common punctuation).
  s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\uFE0F]/gu, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

// Build the {title, caption} speech text. The edge provider joins them with a
// full stop so the voice pauses naturally between them.
function buildParts(title, caption) {
  const cleanTitle = sanitizeForSpeech(title, 120);
  const cleanCaption = sanitizeForSpeech(caption, 600);
  return { cleanTitle, cleanCaption };
}

// ----------------------------------------------------------------------------
// Provider: Microsoft Edge neural voices (msedge-tts)
// ----------------------------------------------------------------------------

// Lazily import msedge-tts so the dependency only loads when we actually need
// it, and the server still boots if it's absent / offline.
let _edgeModulePromise = null;
function loadEdgeModule() {
  if (!_edgeModulePromise) _edgeModulePromise = import('msedge-tts');
  return _edgeModulePromise;
}

// In-process cache of the available voices per language. Populated lazily by
// listVoices(); never expires within a process (the catalogue is stable).
const _voicesCache = new Map(); // lang -> [{ shortName, displayName, gender, locale }]

/**
 * List the Edge neural voices available for a UI language. Fetches Edge's
 * online catalogue once and caches it; filters by locale prefix (zh→zh-CN,
 * en→en-US). On network failure falls back to a built-in whitelist so the
 * picker is never empty.
 *
 * @param {string} lang  UI language ('zh' | 'en')
 * @returns {Promise<Array<{ shortName: string, displayName: string, gender: string, locale: string }>>}
 */
export async function listVoices(lang = 'zh') {
  const userLang = normalizeLang(lang);
  if (_voicesCache.has(userLang)) return _voicesCache.get(userLang);

  const localePrefix = LANG_LOCALE[userLang] || LANG_LOCALE.zh;
  let voices;
  try {
    const { MsEdgeTTS } = await loadEdgeModule();
    const all = await new MsEdgeTTS().getVoices();
    voices = all
      .filter((v) => typeof v?.Locale === 'string' && v.Locale.startsWith(localePrefix))
      .map((v) => ({
        shortName: v.ShortName,
        displayName: prettifyVoiceName(v.ShortName, v.Gender, v.Locale),
        gender: v.Gender || '',
        locale: v.Locale,
      }));
    if (!voices.length) throw new Error('empty catalogue');
  } catch (e) {
    log.warn(`[audio] listVoices(${userLang}) fell back to built-in whitelist: ${e?.message}`);
    voices = (FALLBACK_VOICES[userLang] || FALLBACK_VOICES.zh).map((shortName) => ({
      shortName,
      displayName: prettifyVoiceName(shortName, '', localePrefix),
      gender: '',
      locale: localePrefix,
    }));
  }

  _voicesCache.set(userLang, voices);
  return voices;
}

/**
 * Resolve a requested voice to a usable Edge ShortName: returns `voice` if it's
 * in the language's available list, otherwise the language default.
 *
 * @param {string|null|undefined} voice
 * @param {string} lang
 * @returns {Promise<string>}
 */
export async function resolveVoice(voice, lang = 'zh') {
  const userLang = normalizeLang(lang);
  const fallback = DEFAULT_VOICE[userLang] || DEFAULT_VOICE.zh;
  if (!voice || typeof voice !== 'string') return fallback;
  const voices = await listVoices(userLang);
  return voices.some((v) => v.shortName === voice) ? voice : fallback;
}

// Escape XML special chars for safe embedding in SSML.
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * Synthesise narration with a concrete Edge voice. Writes an .mp3.
 *
 * @param {{
 *   outPathFor: (ext: string) => string,
 *   cleanTitle: string, cleanCaption: string,
 *   voice: string, timeoutMs: number,
 * }} args
 */
async function synthEdge({ outPathFor, cleanTitle, cleanCaption, voice, timeoutMs }) {
  if (!cleanTitle && !cleanCaption) return { ok: false, reason: 'nothing to speak' };

  const { MsEdgeTTS, OUTPUT_FORMAT } = await loadEdgeModule();

  // msedge-tts injects this string RAW into its <prosody> SSML body, so we
  // XML-escape it. We join title + body with a full stop (not an SSML
  // <break>, which the Edge endpoint rejects when embedded via toStream —
  // it returns an empty stream) so the voice pauses naturally between them.
  const titlePart = cleanTitle ? xmlEscape(cleanTitle.replace(/[。.!?！？]\s*$/, '')) : '';
  const bodyPart = cleanCaption ? xmlEscape(cleanCaption) : '';
  const input = [titlePart, bodyPart].filter(Boolean).join('. ');

  const outPath = outPathFor('mp3');
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      try { tts.close?.(); } catch {}
      resolve(val);
    };
    const t = setTimeout(
      () => finish({ ok: false, reason: `edge timed out after ${timeoutMs}ms` }),
      timeoutMs,
    );
    let stream;
    try {
      ({ audioStream: stream } = tts.toStream(input));
    } catch (e) {
      finish({ ok: false, reason: `edge request error: ${e?.message}` });
      return;
    }
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('error', (e) => finish({ ok: false, reason: `edge stream error: ${e?.message}` }));
    const done = async () => {
      const buf = Buffer.concat(chunks);
      if (buf.length < 256) { finish({ ok: false, reason: 'edge audio too small' }); return; }
      try {
        await fs.writeFile(outPath, buf);
      } catch (e) { finish({ ok: false, reason: `edge write error: ${e?.message}` }); return; }
      finish({ ok: true, ext: 'mp3', voice, provider: 'edge' });
    };
    stream.on('end', done);
    stream.on('close', done);
  });
}

// ----------------------------------------------------------------------------
// Orchestrator
// ----------------------------------------------------------------------------

/**
 * Run the Edge provider against an outPath resolver. Shared by node narration
 * and voice previews. Also clears any stale .m4a left by the old `say`
 * provider so a slot never holds two audio files.
 *
 * @param {{
 *   outPathFor: (ext: string) => string,
 *   cleanTitle: string, cleanCaption: string,
 *   voice: string, timeoutMs: number,
 * }} args
 */
async function runProvider({ outPathFor, cleanTitle, cleanCaption, voice, timeoutMs }) {
  try {
    const r = await synthEdge({ outPathFor, cleanTitle, cleanCaption, voice, timeoutMs });
    if (r.ok) {
      // Clear a stale .m4a from the retired `say` provider, if any.
      fs.unlink(outPathFor('m4a')).catch(() => {});
      return r;
    }
    return r;
  } catch (e) {
    const reason = e?.message || String(e);
    log.warn(`[audio] edge provider threw: ${reason}`);
    return { ok: false, reason };
  }
}

/**
 * Generate narration audio for a node using a concrete Edge voice.
 *
 * @param {{
 *   canvasId: string, hash: string,
 *   title?: string, caption?: string,
 *   voice?: string, lang?: string, timeoutMs?: number,
 * }} args
 * @returns {Promise<{ ok: boolean, ext?: string, voice?: string, provider?: string, reason?: string }>}
 */
export async function generateAudio({
  canvasId,
  hash,
  title = '',
  caption = '',
  voice,
  lang = 'zh',
  timeoutMs = config.audioTimeoutMs,
}) {
  if (!config.enableAudio) return { ok: false, reason: 'audio disabled' };

  const userLang = normalizeLang(lang);
  const resolvedVoice = await resolveVoice(voice, userLang);
  const { cleanTitle, cleanCaption } = buildParts(title, caption);
  if (!cleanTitle && !cleanCaption) return { ok: false, reason: 'nothing to speak' };

  return runProvider({
    outPathFor: (ext) => paths.audioPath(canvasId, hash, ext),
    cleanTitle, cleanCaption, voice: resolvedVoice, timeoutMs,
  });
}

// The fixed welcome blurb spoken in a voice preview (试听). Localised; kept
// short so previews synthesise fast and feel snappy.
const PREVIEW_SAMPLE = {
  zh: { title: '欢迎使用 flipbook', caption: '让我用这个音色，带你一页页探索奇妙的世界。' },
  en: { title: 'Welcome to flipbook', caption: 'Let me guide you through a world of wonder, one page at a time.' },
};

/**
 * Synthesise (and cache) a short welcome sample in the given voice so the UI
 * can let users 试听 a voice before applying it. Cached per (lang, voice) under
 * paths.previewDir(); a hit returns immediately without re-synth.
 *
 * @param {{ voice?: string, lang?: string, timeoutMs?: number }} args
 * @returns {Promise<{ ok: boolean, ext?: string, path?: string, voice?: string, provider?: string, reason?: string }>}
 */
export async function generateVoicePreview({
  voice,
  lang = 'zh',
  timeoutMs = config.audioTimeoutMs,
}) {
  if (!config.enableAudio) return { ok: false, reason: 'audio disabled' };

  const userLang = normalizeLang(lang);
  const resolvedVoice = await resolveVoice(voice, userLang);
  const sample = PREVIEW_SAMPLE[userLang] || PREVIEW_SAMPLE.zh;
  const { cleanTitle, cleanCaption } = buildParts(sample.title, sample.caption);

  // Cache hit: return whichever ext already exists for this (lang, voice).
  for (const ext of ['mp3', 'm4a']) {
    const p = paths.previewPath(userLang, resolvedVoice, ext);
    try {
      const st = await fs.stat(p);
      if (st.size >= 256) return { ok: true, ext, path: p, voice: resolvedVoice, provider: 'cache' };
    } catch { /* miss — fall through to synth */ }
  }

  const result = await runProvider({
    outPathFor: (ext) => paths.previewPath(userLang, resolvedVoice, ext),
    cleanTitle, cleanCaption, voice: resolvedVoice, timeoutMs,
  });
  if (!result.ok) return result;
  return { ...result, path: paths.previewPath(userLang, resolvedVoice, result.ext) };
}
