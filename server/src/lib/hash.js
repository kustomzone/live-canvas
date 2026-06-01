// Port of skill/scripts/hash.mjs.
// sha256(parent + "\n" + label + "\n" + image_prompt).slice(0,12)
import { createHash } from 'node:crypto';

export function hashNode(parentHash, label, imagePrompt) {
  return createHash('sha256')
    .update(`${parentHash ?? ''}\n${label ?? ''}\n${imagePrompt ?? ''}`, 'utf8')
    .digest('hex')
    .slice(0, 12);
}

export function rootHash(topic, imagePrompt) {
  return hashNode('', topic, imagePrompt);
}

// Stable, unique id for an in-progress node, computable BEFORE the planner
// runs (so the node can be persisted + linked immediately). Derived from
// parent + label + jobId + a timestamp, so it never collides across clicks
// and stays fixed for the node's whole lifetime (no temp-id → real-hash
// migration). Same 12-hex shape as hashNode, so routes/validators are
// unchanged. Dedup of identical clicks is handled by scanning sibling nodes
// for a matching label, not by content-hash collision.
export function uniqueNodeId(parentHash, label, jobId) {
  return createHash('sha256')
    .update(`${parentHash ?? ''}\n${label ?? ''}\n${jobId ?? ''}\n${Date.now()}`, 'utf8')
    .digest('hex')
    .slice(0, 12);
}


