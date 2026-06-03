import express from 'express';
import fs from 'node:fs';
import { createCanvas, getCanvas, listCanvases, deleteCanvas } from '../store/canvasStore.js';
import { readTree } from '../store/treeStore.js';
import { isSafeId } from '../store/paths.js';
import { enqueueRootGeneration, resynthesizeCanvasAudio } from '../generation/pipeline.js';
import { normalizeLang } from '../generation/language.js';
import { uploadMemory, persistUpload } from './upload.js';
import { buildCanvasExport } from '../export/buildExport.js';
import { DEFAULT_VOICE, listVoices, resolveVoice, generateVoicePreview } from '../generation/audio.js';
import { config } from '../config.js';

export const canvasRouter = express.Router();

// Whitelist the orientation field from request bodies. Only 'portrait' is
// honoured; everything else (incl. missing) maps to landscape.
function parseOrientation(v) {
  return v === 'portrait' ? 'portrait' : 'landscape';
}

// Validate a requested Edge voice (ShortName) against the language's
// available catalogue. Returns the voice when valid, else null (→ caller
// falls back to the language default).
async function parseVoice(v, lang) {
  if (typeof v !== 'string' || !v) return null;
  const voices = await listVoices(lang);
  return voices.some((x) => x.shortName === v) ? v : null;
}

// Narration voices the server offers, sourced directly from Edge's online
// catalogue (cached) and filtered to the requested UI language. The client
// picks a concrete voice (ShortName); the server validates it against this
// list. `enabled` reflects the ENABLE_AUDIO env switch so the client can hide
// the control when narration is off server-side.
// Query: ?lang=<zh|en>.
canvasRouter.get('/voices', async (req, res) => {
  const lang = normalizeLang(req.query?.lang);
  try {
    const voices = await listVoices(lang);
    res.json({
      enabled: config.enableAudio,
      default: DEFAULT_VOICE[lang] || DEFAULT_VOICE.zh,
      voices,
    });
  } catch (e) {
    res.status(500).json({ error: 'voices_failed', message: e?.message });
  }
});

// Synthesise (or cache-hit) a short welcome sample in the requested voice and
// stream it back, so the UI can let users 试听 a voice before applying it.
// Canvas-independent; cached server-side per (lang, voice).
// Query: ?voice=<ShortName>&lang=<zh|en>. Must be registered before '/:id/*' —
// it isn't shadowed (two literal segments vs '/:id/voice'), but keep it near
// the sibling /voices route for clarity.
canvasRouter.get('/voices/preview', async (req, res) => {
  if (!config.enableAudio) return res.status(409).json({ error: 'audio_disabled' });
  const lang = normalizeLang(req.query?.lang);
  const voice = await resolveVoice(req.query?.voice, lang);
  try {
    const r = await generateVoicePreview({ voice, lang });
    if (!r.ok) return res.status(500).json({ error: 'preview_failed', reason: r.reason });
    res.type(r.ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4');
    fs.createReadStream(r.path).pipe(res);
  } catch (e) {
    res.status(500).json({ error: 'preview_failed', message: e?.message });
  }
});

canvasRouter.get('/', async (req, res) => {
  // Pagination — `limit` opts into the paginated shape `{items,total,hasMore}`.
  // Without `limit` the response stays a flat array (back-compat).
  // Cursor: lastCanvasId pulls the page after that row's createdAt+canvasId
  // keyset; offset is the fallback when the cursor row is missing or absent.
  const rawLimit = req.query?.limit;
  const rawOffset = req.query?.offset;
  const lastCanvasId = req.query?.lastCanvasId
    ? String(req.query.lastCanvasId).slice(0, 64)
    : undefined;
  // Optional orientation filter (landscape | portrait). Anything else = all.
  const orientation = (req.query?.orientation === 'landscape' || req.query?.orientation === 'portrait')
    ? req.query.orientation
    : undefined;
  if (rawLimit !== undefined) {
    const limit = Math.max(1, Math.min(100, Number(rawLimit) || 24));
    const offset = Math.max(0, Number(rawOffset) || 0);
    const page = await listCanvases({ limit, offset, lastCanvasId, orientation });
    return res.json(page);
  }
  const list = await listCanvases({ orientation });
  res.json(list);
});

canvasRouter.post('/', async (req, res) => {
  const { topic, branches, webSearch } = req.body || {};
  const lang = normalizeLang(req.body?.lang);
  const orientation = parseOrientation(req.body?.orientation);
  const voice = await parseVoice(req.body?.voice, lang);
  if (!topic || typeof topic !== 'string' || !topic.trim()) {
    return res.status(400).json({ error: 'topic_required' });
  }
  try {
    const runtime = await createCanvas({ topic: topic.trim(), branches: Number(branches) || 5, orientation, voice });
    // webSearch is an opt-out boolean; default true.
    const webSearchEnabled = webSearch !== false;
    const jobId = enqueueRootGeneration(runtime, { webSearchEnabled, lang });
    res.status(201).json({
      canvasId: runtime.id,
      eventsUrl: `/api/canvas/${runtime.id}/events`,
      jobId,
    });
  } catch (e) {
    res.status(500).json({ error: 'create_failed', message: e?.message });
  }
});

// Multipart upload variant — accepts a topic + a single image file.
// Image is persisted under data/canvases/<id>/uploads/seed.<ext> and
// passed to the planner via seedImagePath so the generated diagram
// preserves the user's content/composition and only restyles + annotates.
canvasRouter.post('/upload', uploadMemory.single('image'), async (req, res) => {
  const topicRaw = (req.body?.topic ?? '').toString();
  const topic = topicRaw.trim();
  const lang = normalizeLang(req.body?.lang);
  // Topic is optional when an image is supplied — but we still need a
  // string to seed the canvas slug, so fall back to a sentinel that the
  // client localises into "内容生成中… / Content generating…". The
  // describe-first step will replace this with the inferred subject as
  // soon as the planner runs.
  const file = req.file;
  if (!topic && !file) {
    return res.status(400).json({ error: 'topic_or_image_required' });
  }
  const webSearchEnabled = req.body?.webSearch !== '0' && req.body?.webSearch !== false;
  const orientation = parseOrientation(req.body?.orientation);
  const voice = await parseVoice(req.body?.voice, lang);
  try {
    const finalTopic = topic || '__pending__';
    const runtime = await createCanvas({ topic: finalTopic, orientation, voice });
    let seedImagePath = null;
    if (file) {
      seedImagePath = await persistUpload(runtime.id, 'seed', file);
    }
    const jobId = enqueueRootGeneration(runtime, { webSearchEnabled, seedImagePath, lang });
    res.status(201).json({
      canvasId: runtime.id,
      eventsUrl: `/api/canvas/${runtime.id}/events`,
      jobId,
    });
  } catch (e) {
    res.status(500).json({ error: 'create_failed', message: e?.message });
  }
});

canvasRouter.get('/:id/tree', async (req, res) => {
  const { id } = req.params;
  if (!isSafeId(id)) return res.status(400).json({ error: 'bad_id' });
  try {
    const tree = await readTree(id);
    res.json(tree);
  } catch {
    res.status(404).json({ error: 'not_found' });
  }
});

// Change the flipbook's narration voice and re-synthesise every node's audio
// with the new voice. The candidate voices come from GET /voices; the client
// sends a concrete Edge voice (ShortName). Returns immediately with the
// accepted voice; re-narration runs async and streams AUDIO_READY + NODE_READY
// per node over SSE so open viewers update live.
canvasRouter.post('/:id/voice', async (req, res) => {
  const { id } = req.params;
  if (!isSafeId(id)) return res.status(400).json({ error: 'bad_id' });
  // Infer language from the voice's locale prefix so we validate against the
  // right catalogue (zh-CN-* → zh, otherwise en).
  const raw = req.body?.voice;
  const lang = typeof raw === 'string' && raw.startsWith('zh-') ? 'zh' : 'en';
  const voice = await parseVoice(raw, lang);
  if (!voice) return res.status(400).json({ error: 'bad_voice' });
  if (!config.enableAudio) return res.status(409).json({ error: 'audio_disabled' });
  const runtime = await getCanvas(id);
  if (!runtime) return res.status(404).json({ error: 'not_found' });
  // Fire-and-forget the (potentially slow) re-synthesis so the request
  // returns promptly; progress is delivered over the canvas's SSE stream.
  resynthesizeCanvasAudio(runtime, voice)
    .catch((e) => { /* logged inside; swallow to avoid unhandled rejection */ void e; });
  res.status(202).json({ ok: true, voice });
});

// Bulk-delete canvases. Body: { ids: string[] }. Each id is validated;
// invalid ids are skipped. Returns { deleted: string[] }. Used by the
// gallery's edit-mode multi-select delete.
canvasRouter.post('/delete', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const valid = ids.filter((x) => typeof x === 'string' && isSafeId(x)).slice(0, 200);
  const deleted = [];
  for (const id of valid) {
    try {
      await deleteCanvas(id);
      deleted.push(id);
    } catch { /* skip individual failures */ }
  }
  res.json({ deleted });
});

// Delete a single canvas.
canvasRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!isSafeId(id)) return res.status(400).json({ error: 'bad_id' });
  try {
    const removed = await deleteCanvas(id);
    if (!removed) return res.status(404).json({ error: 'not_found' });
    res.json({ deleted: [id] });
  } catch (e) {
    res.status(500).json({ error: 'delete_failed', message: e?.message });
  }
});

canvasRouter.get('/:id/manifest', async (req, res) => {
  const { id } = req.params;
  if (!isSafeId(id)) return res.status(400).json({ error: 'bad_id' });
  const runtime = await getCanvas(id);
  if (!runtime) return res.status(404).json({ error: 'not_found' });
  res.json({
    canvasId: runtime.id,
    topic: runtime.topic,
    slug: runtime.slug,
    branches: runtime.branches,
    orientation: runtime.orientation ?? 'landscape',
    createdAt: runtime.createdAt,
  });
});

// Export the whole canvas as a self-contained static site (zip). The archive
// contains index.html / viewer.js / viewer.css / data.js + images/, and opens
// directly from file:// with no server requests — a read-only offline replica
// of the live preview. Streamed as an application/zip attachment.
canvasRouter.get('/:id/export', async (req, res) => {
  const { id } = req.params;
  if (!isSafeId(id)) return res.status(400).json({ error: 'bad_id' });
  const lang = normalizeLang(req.query?.lang);
  try {
    const { buffer, filename } = await buildCanvasExport(id, { lang });
    // RFC 5987 encoded filename so non-ASCII (Chinese) topics survive.
    const asciiFallback = filename.replace(/[^\x20-\x7E]+/g, '_');
    const encoded = encodeURIComponent(filename);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (e) {
    if (e?.message === 'empty_canvas') {
      return res.status(409).json({ error: 'empty_canvas' });
    }
    if (e?.code === 'ENOENT') {
      return res.status(404).json({ error: 'not_found' });
    }
    res.status(500).json({ error: 'export_failed', message: e?.message });
  }
});
