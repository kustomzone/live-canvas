#!/usr/bin/env node
// latest_canvases.mjs — Print the canvasIds produced by the most recent
// hot-canvas-batch run, so the orchestrator can chain into export/publish.
//
// Reads <app>/topics-history/*/run.json, picks the record with the newest
// `timestamp`, and prints its canvases. Pairs with hot-canvas-batch (which
// no longer stores a url — only canvasId/topic/aliases/orientation/nodeCount).
//
// Usage:
//   node latest_canvases.mjs [--app-dir <path>] [--json] [--limit N]
//
//   --app-dir   flipbook app root (default: inferred 4 levels up from script)
//   --json      emit machine-readable JSON instead of the human table
//   --limit N   only print the first N canvases of the latest run

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const out = { appDir: null, json: false, limit: Infinity };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--app-dir') out.appDir = argv[++i];
    else if (a === '--json') out.json = true;
    else if (a === '--limit') out.limit = Number(argv[++i]) || Infinity;
  }
  return out;
}

const args = parseArgs(process.argv);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> hot-canvas-to-douyin/ -> skills/ -> .codebuddy/ -> app/
const APP_DIR = args.appDir
  ? path.resolve(args.appDir)
  : path.resolve(__dirname, '..', '..', '..', '..');
const HISTORY_DIR = path.join(APP_DIR, 'topics-history');

async function main() {
  let dirs = [];
  try { dirs = await fs.readdir(HISTORY_DIR); } catch {
    console.error(`No history dir at ${HISTORY_DIR}. Run hot-canvas-batch first.`);
    process.exit(1);
  }
  let best = null;
  for (const d of dirs) {
    const file = path.join(HISTORY_DIR, d, 'run.json');
    try {
      const rec = JSON.parse(await fs.readFile(file, 'utf8'));
      const ts = Date.parse(rec.timestamp || '') || 0;
      // backfill records carry no real canvases worth publishing; still allow
      // them, but prefer the record with the newest timestamp.
      if (!best || ts > best.ts) best = { ts, rec, dir: d };
    } catch { /* skip */ }
  }
  if (!best) { console.error('No readable run.json found.'); process.exit(1); }

  // Verify the canvas data still exists on disk (the server may have been
  // cleaned). Only surface canvases whose image dir is present.
  const canvases = [];
  for (const c of (best.rec.canvases || [])) {
    const imgDir = path.join(APP_DIR, 'server', 'data', 'canvases', c.canvasId, 'images');
    let imageCount = 0;
    try {
      const files = await fs.readdir(imgDir);
      imageCount = files.filter((f) => /^[0-9a-f]+\.png$/.test(f)).length;
    } catch { /* dir gone */ }
    canvases.push({ ...c, imageCount, present: imageCount > 0 });
    if (canvases.length >= args.limit) break;
  }

  if (args.json) {
    console.log(JSON.stringify({
      runDir: best.dir,
      timestamp: best.rec.timestamp,
      orientation: best.rec.orientation,
      canvases,
    }, null, 2));
    return;
  }

  console.log(`Latest run: ${best.dir}  (${best.rec.timestamp})`);
  console.log(`orientation=${best.rec.orientation}  canvases=${canvases.length}`);
  for (const c of canvases) {
    const flag = c.present ? `${c.imageCount} imgs` : 'MISSING ON DISK';
    console.log(`  ${c.canvasId}  [${flag}]  ${c.topic}`);
  }
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
