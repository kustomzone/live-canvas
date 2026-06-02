// Theme controller — light / dark with a "follow system" default.
//
// Mirrors the shape of i18n.ts: one module-level `current` preference, a
// cookie for persistence, and a window event so every `useTheme()` consumer
// re-renders on change.
//
// Three preferences:
//   'system' (default) — follow the OS prefers-color-scheme, and keep
//                        following it LIVE: when the OS itself flips between
//                        light and dark as the day goes on (macOS "Auto"
//                        appearance, scheduled night mode, etc.), the app
//                        re-applies the matching theme without a reload.
//   'light' / 'dark'   — an explicit override that ignores the OS.
//
// The *effective* theme (what actually paints) is the resolution of the
// preference against the current OS setting. We write it to
// <html data-theme="..."> so global.css can swap the palette.

export type ThemePref = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

const COOKIE_NAME = 'flipbook_theme';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
const EVENT = 'flipbook:theme-change';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) return decodeURIComponent(trimmed.slice(target.length));
  }
  return null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

// Coerce any stored / passed value to a valid preference, defaulting to
// 'system' so a corrupt cookie can never strand the user in a fixed theme.
export function normalizeThemePref(value: unknown): ThemePref {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

// Pure resolution: preference + "does the OS want dark?" → effective theme.
// Kept side-effect-free so it can be unit-tested without a DOM.
export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): EffectiveTheme {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return systemPrefersDark ? 'dark' : 'light';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(DARK_QUERY).matches;
}

function detectInitial(): ThemePref {
  return normalizeThemePref(readCookie(COOKIE_NAME));
}

let current: ThemePref = detectInitial();

export function getThemePref(): ThemePref { return current; }

export function getEffectiveTheme(): EffectiveTheme {
  return resolveTheme(current, systemPrefersDark());
}

// Write the effective theme onto <html data-theme="..."> so the CSS palette
// in global.css takes over. Also kept in sync with the meta theme-color so
// mobile browser chrome (address bar) matches.
export function applyEffectiveTheme() {
  if (typeof document === 'undefined') return;
  const eff = getEffectiveTheme();
  document.documentElement.setAttribute('data-theme', eff);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', eff === 'dark' ? '#1B1813' : '#FAF8F4');
}

export function setThemePref(next: ThemePref) {
  const norm = normalizeThemePref(next);
  if (norm === current) return;
  current = norm;
  writeCookie(COOKIE_NAME, norm);
  applyEffectiveTheme();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: norm }));
  }
}

// Cycle order for a single toggle control: system → light → dark → system.
export function nextThemePref(pref: ThemePref): ThemePref {
  return pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
}

// One-time bootstrap, called as early as possible from main.tsx so the
// correct palette paints on first frame (no light→dark flash). Also wires the
// live OS listener: in 'system' mode an OS day↔night flip re-applies the
// theme and notifies subscribers.
let booted = false;
export function initTheme() {
  if (booted) return;
  booted = true;
  applyEffectiveTheme();
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mql = window.matchMedia(DARK_QUERY);
  const handler = () => {
    // Only 'system' mode tracks the OS; explicit light/dark ignore it.
    if (current !== 'system') return;
    applyEffectiveTheme();
    window.dispatchEvent(new CustomEvent(EVENT, { detail: current }));
  };
  if (mql.addEventListener) mql.addEventListener('change', handler);
  else mql.addListener(handler);
}

// React hook — re-renders subscribers when the preference OR (in system mode)
// the OS setting changes. Returns the preference, the setter, and the
// currently-effective theme so components can render the right icon/label.
import { useEffect, useState } from 'react';

export function useTheme(): {
  pref: ThemePref;
  effective: EffectiveTheme;
  setPref: (p: ThemePref) => void;
} {
  const [pref, setLocal] = useState<ThemePref>(current);
  const [effective, setEffective] = useState<EffectiveTheme>(() => getEffectiveTheme());
  useEffect(() => {
    const handler = () => {
      setLocal(current);
      setEffective(getEffectiveTheme());
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
  return { pref, effective, setPref: setThemePref };
}
