// Boot-time sweep: removes half-generated nodes left over from a server
// crash / SIGINT mid-pipeline. Runs once on startup, BEFORE hydrateFromDisk
// so the DB never sees the broken rows.
//
// A node is "incomplete" if any of the following is true:
//   1. The on-disk `nodes/<hash>.json` is missing entirely (referenced by
//      a parent hotspot or by tree.nodes but never written).
//   2. The node JSON exists but has no `image` field (planner ran but
//      ImageGen never finished).
//   3. The node JSON exists, lists an image, but the image file itself is
//      missing or zero bytes.
//   4. The node JSON has no `generated_at` timestamp — registerNode is
//      atomic on `generated_at`, so a missing one means we crashed before
//      committing.
//
// For every incomplete hash we cascade-delete: the node JSON, image,
// the entry in tree.nodes, all parent children[] references, and the
// parent's hotspots[] entry pointing at it. Descendants are pulled in
// transitively (they can't survive without their parent).
import fs from 'node:fs/promises';
import { paths } from '../store/paths.js';
import { log } from '../lib/log.js';

async function readJsonOrNull(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; }
}

async function writeJsonAtomic(p, data) {
  // tiny inline copy of treeStore.writeJsonAtomic to avoid a circular import
  // through canvasStore (which imports queue.js etc.).
  const tmp = p + '.tmp.' + process.pid + '.' + Date.now();
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, p);
}

async function unlinkIfExists(p) {
  try { await fs.unlink(p); } catch (e) {
    if (e?.code !== 'ENOENT') log.warn(`sweep unlink ${p}: ${e.message}`);
  }
}

async function fileNonEmpty(p) {
  try { const s = await fs.stat(p); return s.size > 0; } catch { return false; }
}

async function isIncompleteNode(canvasId, hash) {
  const node = await readJsonOrNull(paths.nodePath(canvasId, hash));
  if (!node) return true;
  if (!node.image) return true;
  if (!node.generated_at) return true;
  // Image references a relative path like `images/<hash>.<ext>`.
  const m = String(node.image).match(/^images\/([a-f0-9]{12})\.(png|svg)$/);
  if (!m) return true;
  const imgPath = paths.imagePath(canvasId, m[1], m[2]);
  if (!(await fileNonEmpty(imgPath))) return true;
  return false;
}

function collectDescendants(treeNodes, start) {
  const out = [];
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    const h = queue.shift();
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(h);
    const n = treeNodes?.[h];
    if (n?.children) {
      for (const c of n.children) if (!seen.has(c)) queue.push(c);
    }
  }
  return out;
}

async function sweepCanvas(canvasId) {
  const tree = await readJsonOrNull(paths.treePath(canvasId));
  if (!tree?.nodes) return { swept: 0 };

  const dead = new Set();

  // Pass 1: every hash referenced by tree.nodes that is incomplete on disk.
  for (const hash of Object.keys(tree.nodes)) {
    if (await isIncompleteNode(canvasId, hash)) dead.add(hash);
  }

  // Pass 2: every hash referenced by some parent's hotspots[].next_hash but
  // missing from tree.nodes (can happen if the hotspot was appended just
  // before the crash and tree.nodes never got patched).
  for (const parentHash of Object.keys(tree.nodes)) {
    if (dead.has(parentHash)) continue;
    const parent = await readJsonOrNull(paths.nodePath(canvasId, parentHash));
    if (!Array.isArray(parent?.hotspots)) continue;
    for (const h of parent.hotspots) {
      const next = h?.next_hash;
      if (!next) continue;
      if (!tree.nodes[next] || dead.has(next)) {
        // Either the child entry is missing from tree.nodes, or already
        // marked dead — either way the parent's hotspot is stale.
        if (!tree.nodes[next]) dead.add(next);
      }
    }
  }

  if (dead.size === 0) return { swept: 0 };

  // Expand: every descendant of a dead node is also dead.
  const expanded = new Set(dead);
  for (const h of dead) {
    for (const d of collectDescendants(tree.nodes, h)) expanded.add(d);
  }

  // Disk: drop node JSONs and image files (both ext variants).
  for (const h of expanded) {
    await unlinkIfExists(paths.nodePath(canvasId, h));
    await unlinkIfExists(paths.imagePath(canvasId, h, 'png'));
    await unlinkIfExists(paths.imagePath(canvasId, h, 'svg'));
  }

  // tree.json: drop dead entries + scrub children[] references.
  const newNodes = {};
  for (const [h, n] of Object.entries(tree.nodes)) {
    if (expanded.has(h)) continue;
    newNodes[h] = {
      ...n,
      children: (n.children ?? []).filter((c) => !expanded.has(c)),
    };
  }
  tree.nodes = newNodes;
  if (tree.root && expanded.has(tree.root)) tree.root = null;
  await writeJsonAtomic(paths.treePath(canvasId), tree);

  // Each surviving parent JSON: drop hotspots whose next_hash is dead.
  for (const parentHash of Object.keys(newNodes)) {
    const parent = await readJsonOrNull(paths.nodePath(canvasId, parentHash));
    if (!parent?.hotspots) continue;
    const before = parent.hotspots.length;
    const filtered = parent.hotspots.filter((h) => !h?.next_hash || !expanded.has(h.next_hash));
    if (filtered.length !== before) {
      parent.hotspots = filtered;
      await writeJsonAtomic(paths.nodePath(canvasId, parentHash), parent);
    }
  }

  return { swept: expanded.size };
}

export async function sweepIncompleteNodes() {
  const root = paths.canvasesRoot();
  let dirs = [];
  try { dirs = await fs.readdir(root); } catch { return { canvases: 0, swept: 0 }; }
  let totalSwept = 0;
  let touched = 0;
  for (const id of dirs) {
    // Skip non-canvas dirs (no manifest).
    const manifest = await readJsonOrNull(paths.manifestPath(id));
    if (!manifest) continue;
    try {
      const { swept } = await sweepCanvas(id);
      if (swept > 0) {
        log.info(`[sweep] canvas ${id}: dropped ${swept} half-generated node(s)`);
        totalSwept += swept;
        touched++;
      }
    } catch (e) {
      log.warn(`[sweep] canvas ${id} failed: ${e?.message}`);
    }
  }
  if (totalSwept > 0) {
    log.info(`[sweep] cleaned ${totalSwept} half-generated node(s) across ${touched} canvas(es)`);
  }
  return { canvases: touched, swept: totalSwept };
}
