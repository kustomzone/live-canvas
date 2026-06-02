// Mirror of the pure theme-resolution logic that lives in
// app/web/src/lib/theme.ts. As with reducer-hydrate.test.js, the source is
// TypeScript in the web bundle and can't be imported directly into the
// node:test runtime, so we re-implement the side-effect-free helpers here and
// keep them in sync. These cover the behaviour the UI depends on:
//   - 'system' (default) follows the OS prefers-color-scheme, live;
//   - explicit 'light' / 'dark' ignore the OS;
//   - unknown / corrupt values fall back to 'system';
//   - the single-control cycle is system → light → dark → system.

import test from 'node:test';
import assert from 'node:assert/strict';

// --- replicas of web/src/lib/theme.ts pure helpers ---
function normalizeThemePref(value) {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

function resolveTheme(pref, systemPrefersDark) {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return systemPrefersDark ? 'dark' : 'light';
}

function nextThemePref(pref) {
  return pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
}

test('normalizeThemePref accepts the three valid preferences', () => {
  assert.equal(normalizeThemePref('system'), 'system');
  assert.equal(normalizeThemePref('light'), 'light');
  assert.equal(normalizeThemePref('dark'), 'dark');
});

test('normalizeThemePref falls back to system for unknown / corrupt values', () => {
  assert.equal(normalizeThemePref('blue'), 'system');
  assert.equal(normalizeThemePref(''), 'system');
  assert.equal(normalizeThemePref(undefined), 'system');
  assert.equal(normalizeThemePref(null), 'system');
  assert.equal(normalizeThemePref(42), 'system');
});

test('system preference follows the OS prefers-color-scheme', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
});

test('explicit preference ignores the OS setting', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('light', false), 'light');
  assert.equal(resolveTheme('dark', true), 'dark');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('system mode re-resolves when the OS flips day→night', () => {
  // Same preference, OS toggles: effective theme must track it (this is the
  // "dynamic over time" behaviour the live matchMedia listener delivers).
  const pref = 'system';
  const daytime = resolveTheme(pref, false);
  const nighttime = resolveTheme(pref, true);
  assert.equal(daytime, 'light');
  assert.equal(nighttime, 'dark');
  assert.notEqual(daytime, nighttime);
});

test('theme cycle is system → light → dark → system', () => {
  assert.equal(nextThemePref('system'), 'light');
  assert.equal(nextThemePref('light'), 'dark');
  assert.equal(nextThemePref('dark'), 'system');
  // Full loop returns to the start.
  assert.equal(nextThemePref(nextThemePref(nextThemePref('system'))), 'system');
});
