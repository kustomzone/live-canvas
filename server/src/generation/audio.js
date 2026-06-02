// Synthesise narration audio for a node with macOS `say`.
//
// Reads the node's title + caption, picks a voice + speaking rate from the
// canvas-level `voiceStyle` (a mood the planner chose), and writes an
// AAC-in-m4a file at paths.audioPath(canvasId, hash). Failure is non-fatal:
// callers receive { ok: false, reason } and keep the node as-is.
//
// `say` has no SSML emotion, so "style" is expressed as a (voice, rate)
// combination per language. The voiceStyle → (voice, rate) table is the
// single source of truth; the planner only ever picks an abstract mood from
// VOICE_STYLES, never a raw voice name.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { paths } from '../store/paths.js';
import { normalizeLang } from './language.js';
import { log } from '../lib/log.js';

// The abstract moods the planner may choose from. Kept in sync with the
// validator whitelist in planner.js and the prompt schema in planner.md.
export const VOICE_STYLES = Object.freeze([
  'neutral', 'cheerful', 'serious', 'gentle', 'dramatic', 'mysterious', 'energetic',
]);

export const DEFAULT_VOICE_STYLE = 'neutral';

// mood → { voice, rate } per language. rate is words/min passed to `say -r`.
// Chinese system voices are limited, so zh leans on rate + the few named
// voices to differentiate styles; en can use strongly characterful voices.
// Any voice listed here is verified against the installed set at runtime
// (verifyVoice) and falls back to the language default if missing.
const VOICE_MAP = {
  zh: {
    neutral:   { voice: 'Tingting', rate: 180 },
    cheerful:  { voice: 'Sinji',    rate: 205 },
    serious:   { voice: 'Tingting', rate: 158 },
    gentle:    { voice: 'Sinji',    rate: 170 },
    dramatic:  { voice: 'Tingting', rate: 145 },
    mysterious:{ voice: 'Sinji',    rate: 150 },
    energetic: { voice: 'Tingting', rate: 225 },
  },
  en: {
    neutral:   { voice: 'Samantha', rate: 180 },
    cheerful:  { voice: 'Good News', rate: 190 },
    serious:   { voice: 'Daniel',   rate: 160 },
    gentle:    { voice: 'Moira',    rate: 165 },
    dramatic:  { voice: 'Cellos',   rate: 150 },
    mysterious:{ voice: 'Whisper',  rate: 150 },
    energetic: { voice: 'Karen',    rate: 215 },
  },
};

const LANG_DEFAULT_VOICE = { zh: 'Tingting', en: 'Samantha' };

// Cache of installed voice names (lowercased) parsed from `say -v '?'`.
let installedVoices = null;

async function loadInstalledVoices() {
  if (installedVoices) return installedVoices;
  installedVoices = await new Promise((resolve) => {
    const child = spawn('say', ['-v', '?'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString('utf8'); });
    child.on('error', () => resolve(new Set()));
    child.on('close', () => {
      const names = new Set();
      for (const line of out.split('\n')) {
        // Format: "Tingting            zh_CN    # comment". The voice name is
        // everything up to the run of 2+ spaces before the locale column.
        const m = /^(.+?)\s{2,}[a-z]{2}_[A-Z]{2}/.exec(line);
        if (m) names.add(m[1].trim().toLowerCase());
      }
      resolve(names);
    });
  });
  return installedVoices;
}

// Resolve a (voice, rate) for the given style+lang, falling back gracefully
// when the mapped voice isn't installed on this machine.
async function resolveVoice(voiceStyle, lang) {
  const table = VOICE_MAP[lang] || VOICE_MAP.zh;
  const pick = table[voiceStyle] || table[DEFAULT_VOICE_STYLE];
  const voices = await loadInstalledVoices();
  // Empty set = we couldn't enumerate; trust the mapped voice.
  if (!voices.size || voices.has(pick.voice.toLowerCase())) return pick;
  const fallback = LANG_DEFAULT_VOICE[lang] || 'Tingting';
  if (voices.has(fallback.toLowerCase())) return { voice: fallback, rate: pick.rate };
  // Last resort: let `say` use the system default voice (omit -v).
  return { voice: null, rate: pick.rate };
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

/**
 * Generate narration audio for a node.
 *
 * @param {{
 *   canvasId: string,
 *   hash: string,
 *   title?: string,
 *   caption?: string,
 *   voiceStyle?: string,
 *   lang?: string,
 *   timeoutMs?: number,
 * }} args
 * @returns {Promise<{ ok: boolean, ext?: string, voice?: string, style?: string, reason?: string }>}
 */
export async function generateAudio({
  canvasId,
  hash,
  title = '',
  caption = '',
  voiceStyle = DEFAULT_VOICE_STYLE,
  lang = 'zh',
  timeoutMs = config.audioTimeoutMs,
}) {
  if (!config.enableAudio) {
    return { ok: false, reason: 'audio disabled' };
  }
  const style = VOICE_STYLES.includes(voiceStyle) ? voiceStyle : DEFAULT_VOICE_STYLE;
  const userLang = normalizeLang(lang);

  const cleanTitle = sanitizeForSpeech(title, 120);
  const cleanCaption = sanitizeForSpeech(caption, 600);
  // Title, a half-second pause, then the body. `[[slnc N]]` is say's inline
  // silence directive (milliseconds).
  const parts = [];
  if (cleanTitle) parts.push(cleanTitle);
  if (cleanTitle && cleanCaption) parts.push('[[slnc 500]]');
  if (cleanCaption) parts.push(cleanCaption);
  const speech = parts.join(' ').trim();
  if (!speech) return { ok: false, reason: 'nothing to speak' };

  const { voice, rate } = await resolveVoice(style, userLang);
  const outPath = paths.audioPath(canvasId, hash, 'm4a');
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const sayArgs = [];
  if (voice) sayArgs.push('-v', voice);
  if (rate) sayArgs.push('-r', String(rate));
  sayArgs.push('-o', outPath, '--file-format=m4af', '--data-format=aac', speech);

  return new Promise((resolve) => {
    const child = spawn('say', sayArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      try { child.kill('SIGTERM'); } catch {}
      resolve(val);
    };
    const t = setTimeout(
      () => finish({ ok: false, reason: `audio timed out after ${timeoutMs}ms` }),
      timeoutMs,
    );
    child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
    child.on('error', (err) => finish({ ok: false, reason: `say spawn error: ${err.message}` }));
    child.on('close', async (code) => {
      if (code !== 0) {
        log.warn(`[audio] say exited ${code}: ${stderr.slice(0, 200)}`);
        finish({ ok: false, reason: `say exited ${code}` });
        return;
      }
      try {
        const st = await fs.stat(outPath);
        if (st.size < 256) {
          finish({ ok: false, reason: 'audio file too small' });
          return;
        }
      } catch {
        finish({ ok: false, reason: 'audio file missing' });
        return;
      }
      finish({ ok: true, ext: 'm4a', voice: voice || 'system', style });
    });
  });
}
