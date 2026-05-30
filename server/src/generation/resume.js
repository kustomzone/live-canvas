// Resume in-flight node generation when an SSE client reconnects.
//
// If the server crashes / restarts mid-generation, the next boot's sweep
// (server/src/store/sweep.js) drops incomplete nodes from disk + DB. But
// the user's BROWSER state may still show an in-flight click — pendingClicks
// in the reducer for jobs that don't exist server-side any more.
//
// The cleanest UX is for the server, on the first SSE attach to a canvas
// after sweep, to RE-ENQUEUE the generation jobs that were interrupted.
// We approximate the original click by re-using the parent hotspot's
// leader_xy (≈ click point) and label (so the click-label LLM doesn't
// even need to re-infer — userLabel skips that call).
//
// Single-process only — a per-(canvasId) lock prevents repeated SSE
// connections from queueing duplicate resume jobs.
import fs from 'node:fs/promises';
import { paths } from '../store/paths.js';
import { readNode, nodeExists } from '../store/nodeStore.js';
import { readTree } from '../store/treeStore.js';
import { enqueueRootGeneration, enqueueClickExpansion } from '../generation/pipeline.js';
import { log } from '../lib/log.js';

// Per-canvas guard so multiple concurrent SSE attaches don't re-enqueue
// the same set of resume jobs.
const inFlight = new Set();

async function imageOk(canvasId, hash) {
  for (const ext of ['png', 'svg']) {
    try {
      const s = await fs.stat(paths.imagePath(canvasId, hash, ext));
      if (s.size > 0) return true;
    } catch { /* ignore */ }
  }
  return false;
}

async function nodeIsComplete(canvasId, hash) {
  if (!(await nodeExists(canvasId, hash))) return false;
  let node;
  try { node = await readNode(canvasId, hash); } catch { return false; }
  if (!node?.image) return false;
  if (!node?.generated_at) return false;
  return imageOk(canvasId, hash);
}

export async function resumeIncomplete(canvas) {
  if (inFlight.has(canvas.id)) return { resumed: 0 };
  inFlight.add(canvas.id);
  let resumed = 0;
  try {
    const tree = await readTree(canvas.id).catch(() => null);
    if (!tree?.nodes) return { resumed: 0 };

    // Case 1: root node missing or incomplete.
    if (tree.root && !(await nodeIsComplete(canvas.id, tree.root))) {
      log.info(`[resume] ${canvas.id}: root ${tree.root} incomplete — re-enqueueing root generation`);
      // Drop the orphan tree.root entry so the new generateRootNode
      // produces a fresh hash; otherwise hashNode is deterministic and
      // would just collide. The sweep on next boot would do this anyway,
      // but we duplicate the cleanup here for the live-resume path.
      // (The simpler thing: just enqueue and let the cache hit if the
      // node actually IS complete.)
      enqueueRootGeneration(canvas, {});
      resumed++;
    }

    // Case 2: any parent hotspot whose next_hash references a missing /
    // imageless child node. Re-enqueue an expandFromClick using the
    // hotspot's leader_xy as the click coordinate and the hotspot's
    // label as the user-supplied label (so the click-label LLM is
    // skipped entirely in pipeline.js).
    for (const [parentHash, meta] of Object.entries(tree.nodes)) {
      // Only process parents whose own JSON exists (otherwise re-running
      // the click would crash on the missing parent).
      if (!(await nodeIsComplete(canvas.id, parentHash))) continue;
      let parent;
      try { parent = await readNode(canvas.id, parentHash); } catch { continue; }
      if (!Array.isArray(parent.hotspots)) continue;
      for (const h of parent.hotspots) {
        const childHash = h?.next_hash;
        if (!childHash) continue;
        if (await nodeIsComplete(canvas.id, childHash)) continue;
        log.info(`[resume] ${canvas.id}: child ${childHash} of ${parentHash} incomplete — re-enqueueing click "${h.label}"`);
        const clickXY = Array.isArray(h.leader_xy) ? [Number(h.leader_xy[0]), Number(h.leader_xy[1])] : [0.5, 0.5];
        // Re-enqueue. We pass userLabel = the existing hotspot label so
        // the pipeline skips the click-label LLM call and jumps straight
        // to planner + image.
        enqueueClickExpansion(canvas, {
          parentNode: parent,
          clickXY,
          webSearchEnabled: parent.web_search_used !== false,
          userLabel: h.label,
        });
        resumed++;
      }
    }
  } catch (e) {
    log.warn(`[resume] ${canvas.id} failed: ${e?.message}`);
  } finally {
    inFlight.delete(canvas.id);
  }
  return { resumed };
}
