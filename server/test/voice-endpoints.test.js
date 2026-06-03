// E2E for the user-selectable narration voice feature.
//   - GET  /api/canvas/voices       → Edge voice catalogue for a language
//   - POST /api/canvas/:id/voice    → validates an Edge voice (ShortName),
//                                     pins it on the tree, and re-synthesises
//                                     node audio.
//
// The candidate list comes from Edge's online catalogue (cached), filtered to
// the requested UI language. We assert the route validates the voice against
// that list: a valid ShortName is accepted and pinned on tree.voice_style; an
// unknown value is rejected with 400; missing canvases 404; bad ids 400.
//
// Network independence: listVoices() falls back to a built-in whitelist when
// Edge is unreachable, so these tests run offline. We therefore assert only
// that the default voice is present in the returned list (not an exact count),
// and pin a voice taken from whatever list the server returns.

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
const { DEFAULT_VOICE, listVoices } = await import('../src/generation/audio.js');
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

test('GET /api/canvas/voices returns the Edge voice catalogue for the language', async () => {
  const { base, close } = await startServer();
  try {
    const { status, json } = await req(base, 'GET', '/api/canvas/voices?lang=zh');
    assert.equal(status, 200);
    assert.equal(json.enabled, true);
    assert.equal(json.default, DEFAULT_VOICE.zh);
    assert.ok(Array.isArray(json.voices) && json.voices.length > 0, 'voices is a non-empty array');
    // Each entry carries a concrete Edge ShortName.
    assert.ok(json.voices.every((v) => typeof v.shortName === 'string' && v.shortName));
    // The default voice must be one of the offered voices.
    assert.ok(json.voices.some((v) => v.shortName === json.default), 'default voice is in the list');
    // Filtered to the language's locale.
    assert.ok(json.voices.every((v) => v.shortName.startsWith('zh-')), 'zh list only has zh voices');
  } finally {
    await close();
  }
});

test('POST /api/canvas/:id/voice rejects an unknown voice with 400', async () => {
  const { base, close } = await startServer();
  try {
    const c = await createCanvas({ topic: 'T' });
    const { status, json } = await req(base, 'POST', `/api/canvas/${c.id}/voice`, {
      voice: 'zh-CN-NotARealVoiceNeural',
    });
    assert.equal(status, 400);
    assert.equal(json.error, 'bad_voice');
  } finally {
    await close();
  }
});

test('POST /api/canvas/:id/voice rejects a legacy mood string with 400', async () => {
  const { base, close } = await startServer();
  try {
    const c = await createCanvas({ topic: 'T' });
    // Old "mood" values are no longer accepted — only concrete Edge voices.
    const { status, json } = await req(base, 'POST', `/api/canvas/${c.id}/voice`, {
      voice: 'cheerful',
    });
    assert.equal(status, 400);
    assert.equal(json.error, 'bad_voice');
  } finally {
    await close();
  }
});

test('POST /api/canvas/:id/voice on a missing canvas returns 404', async () => {
  const { base, close } = await startServer();
  try {
    const [v] = await listVoices('zh');
    const { status, json } = await req(base, 'POST', '/api/canvas/nonexistent01/voice', {
      voice: v.shortName,
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
    const [v] = await listVoices('zh');
    const { status, json } = await req(base, 'POST', '/api/canvas/..%2Fetc/voice', {
      voice: v.shortName,
    });
    assert.equal(status, 400);
    assert.equal(json.error, 'bad_id');
  } finally {
    await close();
  }
});

test('POST /api/canvas/:id/voice accepts a valid Edge voice (202) and pins it on the tree', async () => {
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

    const voices = await listVoices('zh');
    // Choose a voice other than the default to make the pin observable.
    const chosen = voices.find((v) => v.shortName !== DEFAULT_VOICE.zh) || voices[0];

    const { status, json } = await req(base, 'POST', `/api/canvas/${c.id}/voice`, {
      voice: chosen.shortName,
    });
    assert.equal(status, 202);
    assert.equal(json.ok, true);
    assert.equal(json.voice, chosen.shortName);

    // Re-synthesis is fire-and-forget; tree.voice_style is pinned synchronously
    // at the start of resynthesizeCanvasAudio, but the route returns before it
    // completes. Poll briefly for the pin to land.
    let pinned = null;
    for (let i = 0; i < 50; i++) {
      const tree = await readTree(c.id);
      if (tree.voice_style === chosen.shortName) { pinned = tree.voice_style; break; }
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(pinned, chosen.shortName, 'tree.voice_style should be pinned to the new voice');
  } finally {
    await close();
  }
});

test('createCanvas pins a user-chosen create-time voice onto the tree', async () => {
  const c = await createCanvas({ topic: 'Pinned', voice: 'zh-CN-YunxiNeural' });
  const tree = await readTree(c.id);
  assert.equal(tree.voice_style, 'zh-CN-YunxiNeural');
});

test('createCanvas leaves voice_style null when none is chosen', async () => {
  const c = await createCanvas({ topic: 'Unpinned' });
  const tree = await readTree(c.id);
  assert.equal(tree.voice_style, null);
});
