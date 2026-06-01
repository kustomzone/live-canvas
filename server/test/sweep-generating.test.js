// Sweep must PRESERVE in-progress (status:'generating') nodes — they're
// intentionally persisted without an image so they're linkable while
// generating, and resume.js re-drives them on the next SSE attach. A normal
// imageless node (no status) is still swept.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flipbook-sweep-'));
process.env.DATA_DIR = tmp;

const { paths } = await import('../src/store/paths.js');
const { sweepIncompleteNodes } = await import('../src/store/sweep.js');

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj));
}

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('sweep keeps generating nodes but drops a plain imageless node', async () => {
  const id = 'cSweep01';
  const root = 'aaaaaaaaaaaa';
  const gen = 'beeeeeeeeeee';   // status:'generating' → keep
  const broken = 'cdddddddddd'; // no image, no status → sweep

  writeJson(paths.manifestPath(id), { id, topic: 'T' });
  writeJson(paths.treePath(id), {
    topic: 'T', topic_slug: 't', root, branches: 5, style: 's',
    nodes: {
      [root]: { title: 'Root', depth: 0, parent: null, children: [gen, broken] },
      [gen]: { title: '', depth: 1, parent: root, children: [], status: 'generating' },
      [broken]: { title: 'Broken', depth: 1, parent: root, children: [] },
    },
  });
  // Root: complete.
  writeJson(paths.nodePath(id, root), {
    hash: root, depth: 0, parent: null, title: 'Root', caption: 'c',
    image: `images/${root}.png`, image_prompt: 'p', generated_at: new Date().toISOString(),
    hotspots: [
      { label: 'g', anchor_xy: [0.4, 0.4], leader_xy: [0.4, 0.4], next_hash: gen },
      { label: 'b', anchor_xy: [0.6, 0.6], leader_xy: [0.6, 0.6], next_hash: broken },
    ],
    path: [{ hash: root, title: 'Root' }], style_tag: 'x',
  });
  fs.mkdirSync(path.dirname(paths.imagePath(id, root, 'png')), { recursive: true });
  fs.writeFileSync(paths.imagePath(id, root, 'png'), PNG_1x1);
  // Generating node: no image, status set.
  writeJson(paths.nodePath(id, gen), {
    hash: gen, depth: 1, parent: root, title: '', caption: '', image_prompt: '',
    hotspots: [], status: 'generating', path: [], style_tag: 'x',
  });
  // Broken node: no image, NO status.
  writeJson(paths.nodePath(id, broken), {
    hash: broken, depth: 1, parent: root, title: 'Broken', caption: '', image_prompt: '',
    hotspots: [], path: [], style_tag: 'x',
  });

  await sweepIncompleteNodes();

  assert.equal(fs.existsSync(paths.nodePath(id, gen)), true, 'generating node preserved');
  assert.equal(fs.existsSync(paths.nodePath(id, broken)), false, 'plain imageless node swept');
  const tree = JSON.parse(fs.readFileSync(paths.treePath(id), 'utf8'));
  assert.ok(tree.nodes[gen], 'generating node kept in tree');
  assert.equal(tree.nodes[broken], undefined, 'broken node removed from tree');
});
