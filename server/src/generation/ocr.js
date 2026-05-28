// Run Apple Vision OCR on a generated PNG.
//
// Spawns the sibling Swift script (no compile step). Returns the parsed
// spans, image dimensions, and elapsed_ms. Failure is non-fatal: callers
// receive { ok: false, spans: [], reason } and can keep persisting the node.
//
// Coordinates: bbox is [x, y, w, h] normalized to [0, 1] with origin at the
// image's TOP-LEFT (the Swift helper does the bottom-left → top-left flip).

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { log } from '../lib/log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VISION_SCRIPT = path.join(__dirname, 'ocr-vision.swift');

/**
 * @param {{ imagePath: string, languages?: string[], timeoutMs?: number }} args
 * @returns {Promise<{
 *   ok: boolean,
 *   spans: Array<{ text: string, bbox: [number, number, number, number], confidence: number }>,
 *   imageW?: number,
 *   imageH?: number,
 *   elapsedMs?: number,
 *   reason?: string,
 * }>}
 */
export async function runOcr({
  imagePath,
  languages,
  timeoutMs = config.ocrTimeoutMs,
}) {
  if (!config.enableOcr) {
    return { ok: false, spans: [], reason: 'ocr disabled' };
  }
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (Array.isArray(languages) && languages.length) {
      env.VISION_LANGS = languages.join(',');
    }
    const child = spawn('swift', [VISION_SCRIPT, imagePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let stdout = '';
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
      () => finish({ ok: false, spans: [], reason: `ocr timed out after ${timeoutMs}ms` }),
      timeoutMs,
    );

    child.stdout.on('data', (c) => { stdout += c.toString('utf8'); });
    child.stderr.on('data', (c) => { stderr += c.toString('utf8'); });
    child.on('error', (err) => finish({ ok: false, spans: [], reason: `ocr spawn error: ${err.message}` }));
    child.on('close', (code) => {
      if (code !== 0) {
        log.warn(`[ocr] swift exited ${code}: ${stderr.slice(0, 300)}`);
        finish({ ok: false, spans: [], reason: `ocr exited ${code}` });
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const raw = Array.isArray(parsed?.spans) ? parsed.spans : [];
        const minConf = config.ocrMinConfidence;
        const spans = raw
          .filter((s) => s
            && typeof s.text === 'string'
            && s.text.trim().length > 0
            && Array.isArray(s.bbox) && s.bbox.length === 4
            && (s.confidence ?? 1) >= minConf)
          .slice(0, config.ocrMaxSpans)
          .map((s) => ({
            text: String(s.text).slice(0, 240),
            bbox: [
              clamp01(s.bbox[0]),
              clamp01(s.bbox[1]),
              clamp01(s.bbox[2]),
              clamp01(s.bbox[3]),
            ],
            confidence: Number(s.confidence ?? 1),
          }));
        finish({
          ok: true,
          spans,
          imageW: Number(parsed.image_w) || undefined,
          imageH: Number(parsed.image_h) || undefined,
          elapsedMs: Number(parsed.elapsed_ms) || undefined,
        });
      } catch (e) {
        log.warn('[ocr] could not parse swift output:', e?.message);
        finish({ ok: false, spans: [], reason: 'parse error' });
      }
    });
  });
}

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
