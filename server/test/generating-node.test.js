// Integration test: a click expansion persists the child node EARLY under its
// final id with status:'generating' (so it's immediately linkable + shows a
// catalog spinner), streams onto it, then finalizes the SAME id with an image
// and the status cleared. The parent hotspot is linked to that id from the
// start (next_hash set immediately, not after completion).
//
// Codebuddy is disabled in tests, so the planner uses the stub (no real
// streaming) and the image falls back to the SVG placeholder — but the
// early-persist + finalize lifecycle is independent of those.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flipbook-gen-'));
process.env.DATA_DIR = tmp;

const { paths } = await import('../src/store/paths.js');
const { expandFromClick } = await import('../src/generation/pipeline.js');
const { deleteNodeCascade } = await import('../src/generation/deleteNode.js');
const { initDb } = await import('../src/db/index.js');

// Spatial-dedup + recordNode hit the DB; initialise it so those calls don't
// throw on a missing `hotspots`/`nodes` table.
await initDb();

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj));
}

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function buildParent(id, parentHash) {
  writeJson(paths.treePath(id), {
    topic: 'T', topic_slug: 't', root: parentHash, branches: 5, style: 's',
    nodes: { [parentHash]: { title: 'Parent', depth: 0, parent: null, children: [] } },
  });
  writeJson(paths.nodePath(id, parentHash), {
    hash: parentHash, depth: 0, parent: null, title: 'Parent', caption: 'c',
    image: `images/${parentHash}.png`, image_prompt: 'p',
    generated_at: new Date().toISOString(), web_search_used: false,
    hotspots: [], path: [{ hash: parentHash, title: 'Parent' }], style_tag: 'x',
  });
  fs.mkdirSync(path.dirname(paths.imagePath(id, parentHash, 'png')), { recursive: true });
  fs.writeFileSync(paths.imagePath(id, parentHash, 'png'), PNG_1x1);
}

function fakeRuntime(id) {
  const frames = [];
  const res = { write: (s) => frames.push(s) };
  return {
    runtime: { id, topic: 'T', orientation: 'landscape', sseClients: new Set([res]), queue: { enqueue: () => {} } },
    frames,
  };
}

function parseEvents(frames) {
  const out = [];
  for (const f of frames) {
    const m = /event: ([^\n]+)\ndata: (.+)/s.exec(f);
    if (m) { try { out.push({ type: m[1], data: JSON.parse(m[2]) }); } catch { /* skip */ } }
  }
  return out;
}

test('click expansion persists a generating node early then finalizes the same id', async () => {
  const id = 'cGen01';
  const parentHash = 'a0a0a0a0a0a0';
  buildParent(id, parentHash);
  const parentNode = JSON.parse(fs.readFileSync(paths.nodePath(id, parentHash), 'utf8'));
  const { runtime, frames } = fakeRuntime(id);

  // userLabel skips the LLM click-label call.
  const child = await expandFromClick(runtime, {
    parentNode, clickXY: [0.5, 0.5], webSearchEnabled: false,
    userLabel: '栏杆', lang: 'zh', jobId: 'genJob1',
  });

  assert.ok(child, 'expandFromClick returns the finished child');
  assert.match(child.hash, /^[a-f0-9]{12}$/, 'child id is 12-hex');

  const evts = parseEvents(frames);

  // 1) An early NODE_READY carried the GENERATING child (status set, no image)
  //    — proving it was persisted + announced before completion.
  const genReady = evts.find(
    (e) => e.type === 'node_ready' && e.data.node?.hash === child.hash && e.data.node?.status === 'generating',
  );
  assert.ok(genReady, 'broadcast a generating node_ready for the child early');
  assert.equal(genReady.data.node.image, undefined, 'generating node has no image yet');

  // 2) The parent hotspot was linked to the child id FROM THE START.
  const parentReady = evts.find(
    (e) => e.type === 'node_ready' && e.data.node?.hash === parentHash
      && (e.data.node.hotspots ?? []).some((h) => h.next_hash === child.hash),
  );
  assert.ok(parentReady, 'parent hotspot next_hash linked to child id immediately');

  // 3) Final node on disk: same id, status cleared, image present.
  const finalNode = JSON.parse(fs.readFileSync(paths.nodePath(id, child.hash), 'utf8'));
  assert.equal(finalNode.status, undefined, 'final node has no generating status');
  assert.ok(finalNode.image, 'final node has an image');
  assert.equal(finalNode.hash, child.hash, 'id is unchanged (no migration)');

  // 4) tree.json: the child entry exists, has no generating status, linked under parent.
  const tree = JSON.parse(fs.readFileSync(paths.treePath(id), 'utf8'));
  assert.ok(tree.nodes[child.hash], 'child in tree');
  assert.equal(tree.nodes[child.hash].status, undefined, 'tree entry status cleared on finalize');
  assert.ok(tree.nodes[parentHash].children.includes(child.hash), 'child linked under parent');
});

test('deleteNodeCascade removes a generating node (no image) cleanly', async () => {
  const id = 'cGen02';
  const parentHash = 'b0b0b0b0b0b0';
  const childId = 'c1c1c1c1c1c1';
  // Parent with a hotspot pointing at a still-generating child.
  writeJson(paths.treePath(id), {
    topic: 'T', topic_slug: 't', root: parentHash, branches: 5, style: 's',
    nodes: {
      [parentHash]: { title: 'Parent', depth: 0, parent: null, children: [childId] },
      [childId]: { title: '', depth: 1, parent: parentHash, children: [], status: 'generating' },
    },
  });
  writeJson(paths.nodePath(id, parentHash), {
    hash: parentHash, depth: 0, parent: null, title: 'Parent', caption: 'c',
    image: `images/${parentHash}.png`, image_prompt: 'p',
    generated_at: new Date().toISOString(), web_search_used: false,
    hotspots: [{ label: 'x', anchor_xy: [0.5, 0.5], leader_xy: [0.5, 0.5], next_hash: childId }],
    path: [{ hash: parentHash, title: 'Parent' }], style_tag: 'x',
  });
  writeJson(paths.nodePath(id, childId), {
    hash: childId, depth: 1, parent: parentHash, title: '', caption: '', image_prompt: '',
    hotspots: [], status: 'generating', path: [], style_tag: 'x',
  });
  const { runtime, frames } = fakeRuntime(id);

  const r = await deleteNodeCascade(runtime, childId);
  assert.deepEqual(r.deletedHashes, [childId]);

  // Node JSON gone, tree entry gone, parent hotspot dropped.
  assert.equal(fs.existsSync(paths.nodePath(id, childId)), false, 'child node JSON unlinked');
  const tree = JSON.parse(fs.readFileSync(paths.treePath(id), 'utf8'));
  assert.equal(tree.nodes[childId], undefined, 'child removed from tree');
  assert.deepEqual(tree.nodes[parentHash].children, [], 'parent children pruned');
  const parent = JSON.parse(fs.readFileSync(paths.nodePath(id, parentHash), 'utf8'));
  assert.equal(parent.hotspots.length, 0, 'parent hotspot dropped');

  const evts = parseEvents(frames);
  assert.ok(evts.some((e) => e.type === 'node_deleted' && e.data.hash === childId), 'node_deleted broadcast');
});
