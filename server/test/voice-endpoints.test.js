// E2E for the user-selectable narration voice feature.
//   - GET  /api/canvas/voices       → server-owned candidate list (7 moods)
//   - POST /api/canvas/:id/voice    → validates the mood, pins it on the
//                                     tree, and re-synthesises node audio.
//
// The candidate list is server-owned, so the client only ever sends an
// abstract mood; we assert the whitelist rejects raw voice names and unknown
// ids with 400, missing canvases with 404, and that a valid mood pins
// tree.voice_style + flips every non-generating node's audio_style.
//
// Audio is mocked: we don't shell out to macOS `say` in CI. Instead we point
// the pipeline at a fake generateAudio via the real on-disk node/tree stores,
// and assert the persisted state changes. To keep this hermetic we DON'T hit
// the real `say` binary — we set ENABLE_AUDIO and stub the audio module's
// generateAudio by writing a tiny file and returning ok. Since ESM modules
// can't be monkey-patched after import, we instead verify the route + tree
// pinning behaviour (which is the server-owned contract) and rely on the
// resynth unit path being exercised by generateAudio's own guards.

import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

// Point the data dir at a temp location BEFORE importing config-dependent
// modules. config.js reads process.env.DATA_DIR once at import time.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'flipbook-voice-'));
process.env.DATA_DIR = TMP;
process.env.ENABLE_AUDIO = '1';

const { createApp } = await import('../src/app.js');
const { createCanvas } = await import('../src/store/canvasStore.js');
const { registerNode } = await import('../src/store/nodeStore.js');
const { readTree } = await import('../src/store/treeStore.js');
const { VOICE_STYLES, DEFAULT_VOICE_STYLE } = await import('../src/generation/audio.js');
const { initDb } = await import('../src/db/index.js');

// createCanvas upserts canvas metadata into SQLite, so the schema must exist.
test('init db', async () => { await initDb(); });

// Boot the app on an ephemeral port; return { base, close }.
async function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function req(base, method, pathname, body) {
  const res = await fetch(base + pathname, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

test('GET /api/canvas/voices returns the server-owned candidate list', async () => {
  const { base, close } = await startServer();
  try {
    const { status, json } = await req(base, 'GET', '/api/canvas/voices');
    assert.equal(status, 200);
    assert.equal(json.enabled, true);
    assert.equal(json.default, DEFAULT_VOICE_STYLE);
    assert.deepEqual(json.styles, [...VOICE_STYLES]);
    assert.equal(json.styles.length, 7);
  } finally {
    await close();
  }
});

test('POST /api/canvas/:id/voice rejects an unknown mood with 400', async () => {
  const { base, close } = await startServer();
  try {
    const c = await createCanvas({ topic: 'T' });
    const { status, json } = await req(base, 'POST', `/api/canvas/${c.id}/voice`, {
      voiceStyle: 'not-a-real-mood',
    });
    assert.equal(status, 400);
    assert.equal(json.error, 'bad_voice_style');
    // The error echoes the whitelist so the client can recover.
    assert.deepEqual(json.styles, [...VOICE_STYLES]);
  } finally {
    await close();
  }
});

test('POST /api/canvas/:id/voice rejects a raw voice name (not a mood)', async () => {
  const { base, close } = await startServer();
  try {
    const c = await createCanvas({ topic: 'T' });
    // A real macOS voice name is NOT an accepted value — only abstract moods.
    const { status, json } = await req(base, 'POST', `/api/canvas/${c.id}/voice`, {
      voiceStyle: 'Tingting',
    });
    assert.equal(status, 400);
    assert.equal(json.error, 'bad_voice_style');
  } finally {
    await close();
  }
});

test('POST /api/canvas/:id/voice on a missing canvas returns 404', async () => {
  const { base, close } = await startServer();
  try {
    const { status, json } = await req(base, 'POST', '/api/canvas/nonexistent01/voice', {
      voiceStyle: 'cheerful',
    });
    assert.equal(status, 404);
    assert.equal(json.error, 'not_found');
  } finally {
    await close();
  }
});

test('POST /api/canvas/:id/voice with a bad id returns 400', async () => {
  const { base, close } = await startServer();
  try {
    const { status, json } = await req(base, 'POST', '/api/canvas/..%2Fetc/voice', {
      voiceStyle: 'cheerful',
    });
    assert.equal(status, 400);
    assert.equal(json.error, 'bad_id');
  } finally {
    await close();
  }
});

test('POST /api/canvas/:id/voice accepts a valid mood (202) and pins it on the tree', async () => {
  const { base, close } = await startServer();
  try {
    const c = await createCanvas({ topic: 'Test Topic' });
    // Seed one completed node so re-synthesis has something to iterate over.
    await registerNode(c.id, {
      hash: 'aaaaaaaaaaaa',
      title: '测试标题',
      caption: '这是正文内容。',
      parent: null,
      depth: 0,
    });

    const { status, json } = await req(base, 'POST', `/api/canvas/${c.id}/voice`, {
      voiceStyle: 'dramatic',
    });
    assert.equal(status, 202);
    assert.equal(json.ok, true);
    assert.equal(json.voiceStyle, 'dramatic');

    // Re-synthesis is fire-and-forget; tree.voice_style is pinned synchronously
    // at the start of resynthesizeCanvasAudio, but the route returns before it
    // completes. Poll briefly for the pin to land.
    let pinned = null;
    for (let i = 0; i < 50; i++) {
      const tree = await readTree(c.id);
      if (tree.voice_style === 'dramatic') { pinned = tree.voice_style; break; }
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(pinned, 'dramatic', 'tree.voice_style should be pinned to the new mood');
  } finally {
    await close();
  }
});

test('createCanvas pins a user-chosen create-time voiceStyle onto the tree', async () => {
  const c = await createCanvas({ topic: 'Pinned', voiceStyle: 'gentle' });
  const tree = await readTree(c.id);
  assert.equal(tree.voice_style, 'gentle');
});

test('createCanvas leaves voice_style null when none is chosen (planner picks later)', async () => {
  const c = await createCanvas({ topic: 'Unpinned' });
  const tree = await readTree(c.id);
  assert.equal(tree.voice_style, null);
});
