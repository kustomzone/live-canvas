// Tests for callOnceStream — the streaming planner path. It drives codebuddy
// with --output-format stream-json --include-partial-messages, accumulating
// `text_delta` chunks (filtering out thinking_delta) and invoking onDelta with
// the running answer. We inject a fake runner that emits stream_event lines via
// onStdoutLine to prove: deltas accumulate in order, thinking is ignored, and
// the final accumulated JSON is parsed into `parsed`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { callOnceStream, __setRunCodebuddyForTest } from '../src/codebuddyClient.js';
import { extractPartialField } from '../src/generation/planner.js';

// Build a fake runner that feeds the given list of stream_event `event`
// objects to onStdoutLine (one JSON line each), then resolves with a stdout
// that ALSO contains the final assistant envelope (belt-and-suspenders for the
// non-delta fallback path).
function fakeStreamRunner(events, finalAnswer) {
  return async ({ onStdoutLine }) => {
    for (const ev of events) {
      onStdoutLine(JSON.stringify({ type: 'stream_event', event: ev }));
    }
    return {
      stdout: JSON.stringify([{ type: 'result', result: finalAnswer }]),
      stderr: '',
      exitInfo: { code: 0, signal: null },
    };
  };
}

// Helper: a text_delta event.
const textDelta = (text) => ({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text } });
const thinkDelta = (thinking) => ({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking } });

test('callOnceStream accumulates text_delta, ignores thinking, parses final JSON', async () => {
  const answer = '{"title":"绿茶","caption":"以**杀青**锁住","image_prompt":"一幅图谱"}';
  // Stream it in chunks, with a thinking block first that must be ignored.
  const chunks = ['{"title":"绿', '茶","cap', 'tion":"以**杀青**锁住","image_prompt":"一幅图谱"}'];
  const events = [
    thinkDelta('让我想想'),       // must NOT appear in accumulated answer
    ...chunks.map(textDelta),
  ];
  __setRunCodebuddyForTest(fakeStreamRunner(events, answer));

  const seen = [];
  try {
    const { parsed } = await callOnceStream({
      prompt: 'x', tag: 'test',
      onDelta: (full) => seen.push(full),
    });
    // onDelta called once per text_delta (3 times), each with growing text.
    assert.equal(seen.length, 3);
    assert.equal(seen[0], '{"title":"绿');
    assert.equal(seen[2], answer); // final accumulation == full JSON
    // thinking text never leaked into the accumulated answer.
    assert.ok(!seen[2].includes('让我想想'));
    // Final parse yields the structured object.
    assert.equal(parsed.title, '绿茶');
    assert.equal(parsed.image_prompt, '一幅图谱');
  } finally {
    __setRunCodebuddyForTest(null);
  }
});

test('callOnceStream partial extraction tracks title before caption', async () => {
  // Verify extractPartialField against the same streamed buffers a consumer
  // (pipeline) would see — title resolves early, caption later.
  const answer = '{"title":"故宫","caption":"明清两代皇宫","image_prompt":"p"}';
  const events = [];
  let acc = '';
  for (const ch of answer) { acc += ch; events.push(textDelta(ch)); }
  __setRunCodebuddyForTest(fakeStreamRunner(events, answer));

  let titleAtCaptionStart = null;
  try {
    await callOnceStream({
      prompt: 'x', tag: 'test',
      onDelta: (full) => {
        const cap = extractPartialField(full, 'caption');
        if (cap !== null && titleAtCaptionStart === null) {
          // When caption first appears, title must already be complete.
          titleAtCaptionStart = extractPartialField(full, 'title');
        }
      },
    });
    assert.equal(titleAtCaptionStart, '故宫');
  } finally {
    __setRunCodebuddyForTest(null);
  }
});
