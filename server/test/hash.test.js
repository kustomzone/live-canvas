import test from 'node:test';
import assert from 'node:assert/strict';
import { hashNode, rootHash, uniqueNodeId } from '../src/lib/hash.js';

test('hashNode is 12 hex chars', () => {
  const h = hashNode('', 'topic', 'a scene');
  assert.match(h, /^[a-f0-9]{12}$/);
});

test('hashNode is deterministic', () => {
  const a = hashNode('parent', 'lab', 'prompt');
  const b = hashNode('parent', 'lab', 'prompt');
  assert.equal(a, b);
});

test('different parents → different hash', () => {
  const a = hashNode('p1', 'same label', 'same prompt');
  const b = hashNode('p2', 'same label', 'same prompt');
  assert.notEqual(a, b);
});

test('different labels → different hash', () => {
  const a = hashNode('p', 'A', 'prompt');
  const b = hashNode('p', 'B', 'prompt');
  assert.notEqual(a, b);
});

test('rootHash uses empty parent', () => {
  assert.equal(rootHash('topic', 'prompt'), hashNode('', 'topic', 'prompt'));
});

test('uniqueNodeId is 12 hex chars (same shape as hashNode)', () => {
  const id = uniqueNodeId('parent', 'label', 'job1234');
  assert.match(id, /^[a-f0-9]{12}$/);
});

test('uniqueNodeId differs across jobIds even with same parent+label', () => {
  const a = uniqueNodeId('p', 'lab', 'jobA');
  const b = uniqueNodeId('p', 'lab', 'jobB');
  assert.notEqual(a, b);
});

test('uniqueNodeId differs across calls (timestamp salt) for the same inputs', async () => {
  const a = uniqueNodeId('p', 'lab', 'job');
  await new Promise((r) => setTimeout(r, 2));
  const b = uniqueNodeId('p', 'lab', 'job');
  assert.notEqual(a, b);
});
