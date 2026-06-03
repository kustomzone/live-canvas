// Mirrors the server's node JSON schema.
export type Hotspot = {
  label: string;
  anchor_xy: [number, number];
  leader_xy: [number, number];
  next_prompt?: string;
  next_hash?: string | null;
};

export type SourceRef = {
  title: string;
  url: string;
  snippet?: string | null;
  source?: string | null; // hostname / publisher
};

// One OCR'd text run baked into the generated image. bbox is normalized
// 0..1 with origin at the image's TOP-LEFT.
export type TextSpan = {
  text: string;
  bbox: [number, number, number, number];
  confidence?: number;
};

export type Node = {
  hash: string;
  depth: number;
  parent: string | null;
  title: string;
  caption: string;
  image: string;          // relative path (e.g. "images/<hash>.png")
  image_prompt: string;
  hotspots: Hotspot[];
  sources?: SourceRef[];
  text_layer?: TextSpan[];
  image_w?: number;
  image_h?: number;
  // Narration audio (macOS `say`). Present once the async audio pass
  // finishes; audio_url is the assets-route URL for playback.
  audio?: string;          // relative path (e.g. "audio/<hash>.m4a")
  audio_url?: string;      // web-accessible URL
  audio_voice?: string;    // resolved `say` voice name
  audio_style?: string;    // narration mood the planner chose
  // True if this node was generated with the web-search step enabled.
  // Used by the UI on navigation to default the toggle to the value picked
  // when this node was created.
  web_search_used?: boolean;
  // Persisted seed-image absolute path (server-side filesystem) — present
  // when this node was generated from an uploaded image. The frontend
  // mostly uses it as an "this node had a seed" signal; the actual file
  // isn't fetchable over the API.
  seed_image?: string | null;
  // Web-accessible URL for the seed image (assets route). Present when
  // this node was generated from an uploaded image.
  seed_image_url?: string | null;
  // Snapshot of the original click context that produced this node.
  // Replayed by the regenerate flow; also surfaced as the info-hover
  // popover in the More menu.
  gen_inputs?: {
    parent_hash: string | null;
    click_xy: [number, number] | null;
    user_label: string | null;
    user_topic?: string | null;
    seed_image: string | null;
  } | null;
  path: { hash: string; title: string }[];
  generated_at: string;
  style_tag: string;
  // Present (='generating') while the node is still being produced: it's
  // persisted early under its final id so it's linkable + streams its
  // title/caption/image_prompt via PLANNER_DELTA. Cleared once complete.
  status?: 'generating';
};export type Tree = {
  topic: string;
  topic_slug: string;
  root: string | null;
  branches: number;
  style: string;
  orientation?: 'landscape' | 'portrait';
  // Flipbook-level narration voice (an Edge voice ShortName, e.g.
  // zh-CN-XiaoxiaoNeural). null = use the language default. Set when the user
  // pins one at create time or changes the voice on an open book.
  voice_style?: string | null;
  nodes: Record<string, { title: string; depth: number; parent: string | null; children: string[]; status?: 'generating' }>;
};

// SSE event payloads
export type SseEvent =
  | { type: 'planning_started'; canvasId: string; jobId: string; parentHash: string | null; hotspotIndex: number | null; label: string | null; clickXY?: [number, number] }
  | { type: 'search_started'; canvasId: string; jobId: string; queries: string[] }
  | { type: 'search_done'; canvasId: string; jobId: string; queries: string[]; sourceCount: number }
  | { type: 'planner_done'; canvasId: string; jobId: string; hash: string; node: Omit<Node, 'image' | 'generated_at'> }
  | { type: 'planner_delta'; canvasId: string; jobId: string; hash?: string; title?: string; caption?: string; image_prompt?: string; attempt?: number; maxAttempts?: number }
  | { type: 'image_started'; canvasId: string; jobId: string; hash: string }
  | { type: 'image_ready'; canvasId: string; jobId: string; hash: string; imageUrl: string; fallback: boolean }
  | { type: 'variants_ready'; canvasId: string; jobId: string; hash: string; variants: string[] }
  | { type: 'ocr_done'; canvasId: string; jobId: string; hash: string; spanCount: number }
  | { type: 'audio_ready'; canvasId: string; jobId: string; hash: string; audioUrl: string; voice?: string; style?: string }
  | { type: 'node_ready'; canvasId: string; jobId: string; hash: string; node: Node }
  | { type: 'tree_updated'; canvasId: string; jobId: string; treeNodeCount: number }
  | { type: 'phase_message'; canvasId: string; jobId: string; messageKey: string; messageEn: string }
  | { type: 'gen_error'; canvasId: string; jobId: string; phase: 'plan' | 'image' | 'register'; message: string; recoverable: boolean; code?: string }
  | { type: 'click_rejected'; canvasId: string; jobId: string; parentHash: string; clickXY: [number, number]; reason: string }
  | { type: 'node_deleted'; canvasId: string; hash: string; deletedHashes: string[]; parentHash: string | null; cancelledHotspot?: { parentHash: string; label: string | null; anchorXY: [number, number] | null; leaderXY: [number, number] | null } }
  | { type: 'done'; canvasId: string; jobId: string; hash: string; cacheHit: boolean };

// UI-only types
export type GenStatus =
  | { phase: 'idle' }
  | { phase: 'planning'; jobId?: string }
  | { phase: 'image_loading'; jobId?: string; hash: string }
  | { phase: 'ready' };

export type Toast = {
  id: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  // Optional i18n key resolved at render time, so toast language follows
  // the user's current language selection instead of freezing whatever
  // language the server/model happened to return.
  messageKey?: string;
  messageVars?: Record<string, string | number>;
  // When true the toast never auto-dismisses — it stays until the user
  // closes it. Used for failures / aborts the user should consciously
  // acknowledge (not just transient warnings about a degraded fallback).
  sticky?: boolean;
  // Optional caller-supplied tag for targeted dismissal (e.g. removing a
  // transient "busy" toast once its async work completes). Not rendered.
  tag?: string;
};

export type GalleryEntry = {
  canvasId: string;
  topic: string;
  slug: string;
  branches: number;
  created_at: string;
  last_run_at: string;
  rootHash: string | null;
  coverImage: string | null; // server-relative URL or null
  orientation?: 'landscape' | 'portrait';
  nodeCount: number;
};

export type View = 'gallery' | 'canvas';

// Per-click in-flight progress entry. Keyed by jobId. Position is in [0..1] and
// is set when the user issues the click; the SSE pipeline updates `phase` as
// it advances, then drops the entry on `done`.
export type PendingClick = {
  jobId: string;
  parentHash: string;
  clickXY: [number, number];
  phase: 'planning' | 'image_loading' | 'finalizing';
  startedAt: number;
  // Optional user-facing progress line streamed by the server (i18n key
  // + english fallback). When present the canvas's pending bubble shows
  // this instead of the static phase chip.
  messageKey?: string;
  messageEn?: string;
  // Streaming planner output (typewriter). Accumulated partial text pushed by
  // PLANNER_DELTA as the planner model emits its JSON answer. title/caption
  // feed the bubble + node header; imagePrompt feeds the image-placeholder
  // "drafting the scene…" text while the picture is still generating.
  title?: string;
  caption?: string;
  imagePrompt?: string;
  // Planner retry progress. When the planner fails and re-rolls, the streamed
  // text restarts from scratch (typewriter resets); these counters let the UI
  // show "2/3" so a restart looks intentional rather than glitchy.
  attempt?: number;
  maxAttempts?: number;
  // Set once PLANNER_DONE assigns a hash — lets the user click the pending
  // bubble to navigate into the (still-generating) node's placeholder page.
  hash?: string;
};

export type AppState = {
  view: View;
  canvasId: string | null;
  topic: string | null;
  rootHash: string | null;
  currentHash: string | null;
  nodes: Record<string, Node>;
  tree: Tree | null;
  status: GenStatus;
  toasts: Toast[];

  // v2 additions
  readOnly: boolean;                       // share-link preview mode
  shareToken: string | null;
  pendingClicks: Record<string, PendingClick>; // by jobId
  pendingByParent: Record<string, string[]>;   // parentHash -> [jobId, ...]
  fullscreen: boolean;
  showChrome: boolean;                     // breadcrumb / caption / hint visibility in fullscreen
  showLabels: boolean;                     // hotspot card overlay visibility
  editMode: boolean;                       // edit hotspots (rename / drag); never in read-only
  webSearch: boolean;                      // ask the planner to consult the web before generating
  // Auto-narrate: on first visit to a node, automatically play its narration
  // audio. User-toggleable; persisted to localStorage.
  autoNarrate: boolean;
  // Hashes already auto-narrated this session, so returning to a node doesn't
  // replay automatically (manual play still works). Session-only.
  narratedHashes: Record<string, true>;
  // User's chosen narration voice (a concrete Edge voice ShortName, e.g.
  // zh-CN-XiaoxiaoNeural) or null = "use the language default". This is the
  // GALLERY create-time default only: it pins the next canvas's
  // tree.voice_style and is persisted to localStorage. It is NOT touched when
  // changing an open book's voice.
  voiceStyle: string | null;
  // The OPEN canvas's narration voice (adopted from tree.voice_style). Changing
  // it re-synthesises that book's audio but does NOT affect the gallery
  // create-time default above. Session-only — reloads re-read tree.voice_style.
  canvasVoiceStyle: string | null;
  // Image orientation for the NEXT canvas to be created. Per-canvas: fixed at
  // creation time. When viewing an existing canvas this reflects that
  // canvas's orientation (adopted from its manifest); on the gallery it's the
  // user's create-time preference.
  orientation: 'landscape' | 'portrait';
  // Last click position on the *parent* node, used as the zoom-in origin for
  // the next child's enter animation. Cleared after the animation triggers.
  lastDrillFrom: { parentHash: string; xy: [number, number] } | null;
  // Latest user-facing progress line for ROOT generation (which has no
  // pending-click bubble to attach to). Streamed via phase_message before
  // the first node exists, so the loading screen can show the current step
  // (analysing image / searching / planning / rewording / generating image)
  // instead of a static "正在生成…". Cleared when the root node arrives.
  rootProgress: { messageKey?: string; messageEn?: string } | null;
};

// localStorage-backed pref for the web-search toggle. Read once at module
// load so initialState reflects the user's last choice across page reloads.
// Defaults to OFF when no value is stored or on SSR/Node — web search is
// opt-in; the user enables it explicitly when they want grounded facts.
const WEB_SEARCH_KEY = 'flipbook_web_search';
function readWebSearchPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const v = window.localStorage.getItem(WEB_SEARCH_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch { /* localStorage unavailable */ }
  return false;
}

export function persistWebSearchPref(on: boolean) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(WEB_SEARCH_KEY, on ? '1' : '0'); } catch {}
}

// localStorage-backed pref for the create-time image orientation. When no
// value is stored, default by device: a phone-sized viewport held UPRIGHT
// (height > width) defaults to portrait; everything else (desktop, landscape
// phone/tablet) defaults to landscape.
const ORIENTATION_KEY = 'flipbook_orientation';
function readOrientationPref(): 'landscape' | 'portrait' {
  if (typeof window === 'undefined') return 'landscape';
  try {
    const v = window.localStorage.getItem(ORIENTATION_KEY);
    if (v === 'portrait') return 'portrait';
    if (v === 'landscape') return 'landscape';
  } catch { /* localStorage unavailable */ }
  const isMobileViewport = window.innerWidth <= 720;
  const isUpright = window.innerHeight > window.innerWidth;
  return isMobileViewport && isUpright ? 'portrait' : 'landscape';
}

export function persistOrientationPref(o: 'landscape' | 'portrait') {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(ORIENTATION_KEY, o); } catch {}
}

// localStorage-backed pref for auto-narration. Defaults to ON — the user
// explicitly asked for narration to play on first entering a node.
const AUTO_NARRATE_KEY = 'flipbook_auto_narrate';
function readAutoNarratePref(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = window.localStorage.getItem(AUTO_NARRATE_KEY);
    if (v === '0') return false;
    if (v === '1') return true;
  } catch { /* localStorage unavailable */ }
  return true;
}

export function persistAutoNarratePref(on: boolean) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(AUTO_NARRATE_KEY, on ? '1' : '0'); } catch {}
}

// localStorage-backed pref for the create-time narration voice. Stored as the
// raw style string; absent / empty means "auto" (let the planner pick). The
// candidate styles are server-owned (GET /api/canvas/voices); we don't
// validate the stored value here — an unknown value is harmlessly ignored by
// the server's whitelist and falls back to auto.
const VOICE_STYLE_KEY = 'flipbook_voice_style';
function readVoiceStylePref(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(VOICE_STYLE_KEY);
    if (v && v !== 'auto') return v;
  } catch { /* localStorage unavailable */ }
  return null;
}

export function persistVoiceStylePref(style: string | null) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(VOICE_STYLE_KEY, style ?? 'auto'); } catch {}
}

export const initialState: AppState = {
  view: 'gallery',
  canvasId: null,
  topic: null,
  rootHash: null,
  currentHash: null,
  nodes: {},
  tree: null,
  status: { phase: 'idle' },
  toasts: [],
  readOnly: false,
  shareToken: null,
  pendingClicks: {},
  pendingByParent: {},
  fullscreen: false,
  showChrome: true,
  showLabels: true,
  editMode: false,
  webSearch: readWebSearchPref(),
  orientation: readOrientationPref(),
  autoNarrate: readAutoNarratePref(),
  voiceStyle: readVoiceStylePref(),
  canvasVoiceStyle: null,
  narratedHashes: {},
  lastDrillFrom: null,
  rootProgress: null,
};
