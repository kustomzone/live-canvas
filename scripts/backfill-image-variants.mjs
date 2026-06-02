#!/usr/bin/env node
// backfill-image-variants — generate any MISSING progressive-loading image
// variants (blur / thumb / medium JPEGs) for finalized node PNGs.
//
//   node scripts/backfill-image-variants.mjs [<canvasId> ...] [--force] [--dry]
//
// With no canvasId args it scans every canvas under DATA_DIR. For each
// <hash>.png it checks whether <hash>.blur.jpg / .thumb.jpg / .medium.jpg all
// exist; if any are missing it regenerates the full set (sharp is idempotent).
// Useful for canvases generated before variants existed, or where the async
// variant pass was interrupted.
//
//   --force   regenerate variants even when they already exist
//   --dry     report what WOULD be generated, write nothing

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');

const VARIANT_EXTS = ['blur.jpg', 'thumb.jpg', 'medium.jpg'];
const HASH_RE = /^([a-f0-9]{12})\.png$/;

function parseArgs(argv) {
  const out = { ids: [], force: false, dry: false };
  for (const a of argv) {
    if (a === '--force') out.force = true;
    else if (a === '--dry') out.dry = true;
    else if (!a.startsWith('--')) out.ids.push(a);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { paths, isSafeId } = await import(path.join(APP_ROOT, 'server', 'src', 'store', 'paths.js'));
  const { generateImageVariants } = await import(path.join(APP_ROOT, 'server', 'src', 'generation', 'imageVariants.js'));

  // Resolve the canvas list: explicit args, or every dir under canvases root.
  let ids = args.ids.filter((id) => {
    if (!isSafeId(id)) { console.error(`[skip] invalid canvasId: ${id}`); return false; }
    return true;
  });
  if (!ids.length) {
    const root = paths.canvasesRoot();
    let dirents = [];
    try { dirents = await fsp.readdir(root, { withFileTypes: true }); }
    catch (e) { console.error(`Cannot read canvases dir ${root}: ${e?.message}`); process.exit(1); }
    ids = dirents.filter((d) => d.isDirectory() && isSafeId(d.name)).map((d) => d.name);
  }
  if (!ids.length) { console.log('No canvases found.'); return; }

  let totalPngs = 0;
  let totalMissing = 0;
  let totalGenerated = 0;
  let totalFailed = 0;

  for (const id of ids) {
    const imgDir = paths.imageDir(id);
    let files;
    try { files = await fsp.readdir(imgDir); }
    catch { continue; } // canvas without an images/ dir — skip
    const present = new Set(files);
    const pngHashes = files.map((f) => (HASH_RE.exec(f) || [])[1]).filter(Boolean);
    if (!pngHashes.length) continue;

    const todo = [];
    for (const hash of pngHashes) {
      totalPngs++;
      const missing = VARIANT_EXTS.filter((ext) => !present.has(`${hash}.${ext}`));
      if (args.force || missing.length) {
        totalMissing += missing.length || VARIANT_EXTS.length;
        todo.push({ hash, missing: args.force ? VARIANT_EXTS : missing });
      }
    }
    if (!todo.length) continue;

    console.log(`[canvas ${id}] ${todo.length}/${pngHashes.length} png(s) need variants`);
    for (const { hash, missing } of todo) {
      if (args.dry) {
        console.log(`  [dry] ${hash} → ${missing.join(', ')}`);
        continue;
      }
      const r = await generateImageVariants(id, hash);
      if (r.ok) {
        totalGenerated++;
        console.log(`  [ok]  ${hash} → ${r.variants.join(', ')}`);
      } else {
        totalFailed++;
        console.warn(`  [fail] ${hash} (sharp unavailable or all variants failed)`);
      }
    }
  }

  console.log(
    `\nDone. scanned ${totalPngs} png across ${ids.length} canvas(es); `
    + `${args.dry ? `${totalMissing} missing variant(s) would be generated` : `generated ${totalGenerated} set(s), ${totalFailed} failed`}.`,
  );
  // sharp missing → nothing generated despite work to do = signal failure.
  if (!args.dry && totalFailed > 0 && totalGenerated === 0) process.exit(1);
}

main().catch((e) => { console.error(e?.stack || e); process.exit(1); });
