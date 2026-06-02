#!/usr/bin/env node
// build_canvases.mjs — Self-contained hot-topic flipbook batch builder.
//
// Lifecycle (the script manages everything):
//   1. Pick a free port (or use $PORT) and spawn the flipbook server with
//      ENABLE_CODEBUDDY=1 IMAGE_PROVIDER=codebuddy.
//   2. Read themes from a JSON file (--themes), skip topics generated within
//      the last RECENT_DAYS (dedup against app/topics-history/*/run.json).
//   3. For each theme: create a portrait canvas, wait for the root image,
//      fire DRILL_PER label-driven drilldowns, wait for them to render.
//   4. Write a dated history record (NO url — port is ephemeral).
//   5. ALWAYS kill the server on exit (success, error, or Ctrl-C).
//
// Usage:
//   node build_canvases.mjs --themes themes.json
//
// Flags / env:
//   --themes <path>     REQUIRED. JSON array of {topic, aliases?, branches?, drills[]}.
//   --app-dir <path>    flipbook app root (default: inferred from script path).
//   --keep-server       don't kill the server on exit (debugging).
//   PORT                fixed port (default: an auto-picked free port).
//   ORIENTATION         portrait | landscape (default portrait).
//   RECENT_DAYS         dedup window in days (default 90).
//   DRILL_PER           drilldown children per canvas (default 10).
//   DRY_RUN=1           start server, print dedup plan, build nothing, stop server.

import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ---- args & config ------------------------------------------------------
function parseArgs(argv) {
  const out = { themes: null, appDir: null, keepServer: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--themes') out.themes = argv[++i];
    else if (a === '--app-dir') out.appDir = argv[++i];
    else if (a === '--keep-server') out.keepServer = true;
  }
  return out;
}
const args = parseArgs(process.argv);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> hot-canvas-batch/ -> skills/ -> .codebuddy/ -> app/
const APP_DIR = args.appDir
  ? path.resolve(args.appDir)
  : path.resolve(__dirname, '..', '..', '..', '..');
const HISTORY_DIR = path.join(APP_DIR, 'topics-history');

const ORIENTATION = process.env.ORIENTATION || 'portrait';
const RECENT_DAYS = Number(process.env.RECENT_DAYS || 90);
const DRILL_PER = Number(process.env.DRILL_PER || 10);
const DRY_RUN = process.env.DRY_RUN === '1';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- free-port discovery ------------------------------------------------
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// ---- server lifecycle ---------------------------------------------------
let serverProc = null;
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (args.keepServer) {
    if (serverProc) console.log(`\n[server] left running (--keep-server) pid=${serverProc.pid}`);
    return;
  }
  if (serverProc && serverProc.exitCode === null) {
    try { serverProc.kill('SIGTERM'); } catch { /* ignore */ }
    // Hard-kill fallback if it lingers.
    setTimeout(() => { try { serverProc.kill('SIGKILL'); } catch { /* ignore */ } }, 4000).unref?.();
    console.log(`\n[server] stopped pid=${serverProc.pid}`);
  }
}
// Cover every exit path.
process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(130); });
process.on('SIGTERM', () => { shutdown(); process.exit(143); });

async function startServer(port) {
  const entry = path.join(APP_DIR, 'server', 'src', 'index.js');
  if (!fssync.existsSync(entry)) {
    throw new Error(`server entry not found: ${entry} (pass --app-dir to point at the flipbook app root)`);
  }
  const logPath = path.join(os.tmpdir(), `flipbook-server-${port}.log`);
  const logFd = fssync.openSync(logPath, 'a');
  serverProc = spawn('node', ['server/src/index.js'], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      ENABLE_CODEBUDDY: '1',
      IMAGE_PROVIDER: 'codebuddy',
      PORT: String(port),
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', logFd, logFd],
  });
  serverProc.on('exit', (code, sig) => {
    if (!shuttingDown) console.error(`[server] exited early code=${code} sig=${sig} — see ${logPath}`);
  });
  console.log(`[server] spawned pid=${serverProc.pid} port=${port} log=${logPath}`);
  return logPath;
}

// ---- HTTP helpers -------------------------------------------------------
let BASE_URL = '';
async function api(method, urlPath, body) {
  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${urlPath} -> ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

async function waitServerReady(timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/canvas?limit=1`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(1000);
  }
  throw new Error(`server did not become ready at ${BASE_URL} within ${timeoutMs}ms`);
}

// multipart click with a label override (no file). Label-driven: the child
// subject is deterministic, so the x/y only spread anchors for tidy leader
// lines — they do NOT pick the subject.
async function clickWithLabel(canvasId, parentHash, x, y, label) {
  const form = new FormData();
  form.set('parentHash', parentHash);
  form.set('x', String(x));
  form.set('y', String(y));
  form.set('label', label);
  form.set('webSearch', '1');
  form.set('lang', 'zh');
  const res = await fetch(`${BASE_URL}/api/canvas/${canvasId}/click/upload`, {
    method: 'POST', body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`click "${label}" -> ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

const getTree = (canvasId) => api('GET', `/api/canvas/${canvasId}/tree`);

async function waitForNodes(canvasId, min, { timeoutMs = 900_000, label = '' } = {}) {
  const start = Date.now();
  let last = -1;
  while (Date.now() - start < timeoutMs) {
    let tree;
    try { tree = await getTree(canvasId); } catch { await sleep(2000); continue; }
    const count = Object.keys(tree.nodes || {}).length;
    if (count !== last) {
      process.stdout.write(`\r  [${canvasId}] ${label} nodes=${count}/${min}        `);
      last = count;
    }
    if (count >= min) { process.stdout.write('\n'); return tree; }
    await sleep(3000);
  }
  process.stdout.write('\n');
  throw new Error(`timeout waiting for ${min} nodes on ${canvasId}`);
}

// ---- dedup history ------------------------------------------------------
const normalize = (s) => String(s).toLowerCase().replace(/[\s\u3000，,。.·:：、_\-]+/g, '');

async function loadRecentTopics() {
  const cutoff = Date.now() - RECENT_DAYS * 24 * 3600 * 1000;
  const out = [];
  let dirs = [];
  try { dirs = await fs.readdir(HISTORY_DIR); } catch { return out; }
  for (const d of dirs) {
    const file = path.join(HISTORY_DIR, d, 'run.json');
    try {
      const rec = JSON.parse(await fs.readFile(file, 'utf8'));
      const ts = Date.parse(rec.timestamp || '');
      if (Number.isFinite(ts) && ts < cutoff) continue;
      for (const c of rec.canvases || []) out.push({ topic: c.topic, aliases: c.aliases || [] });
    } catch { /* skip */ }
  }
  return out;
}

function isDuplicate(theme, recent) {
  const keys = new Set([theme.topic, ...(theme.aliases || [])].map(normalize));
  for (const r of recent) {
    const rkeys = [r.topic, ...(r.aliases || [])].map(normalize);
    for (const rk of rkeys) for (const k of keys) {
      if (k && rk && (k === rk || k.includes(rk) || rk.includes(k))) return { dup: true, against: r.topic };
    }
  }
  return { dup: false };
}

function dateTimeDir() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function loadThemes(themesPath) {
  if (!themesPath) throw new Error('--themes <path> is required');
  const raw = await fs.readFile(path.resolve(themesPath), 'utf8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('themes file must be a non-empty JSON array');
  for (const [i, t] of arr.entries()) {
    if (!t || typeof t.topic !== 'string' || !t.topic.trim()) throw new Error(`themes[${i}].topic missing`);
    if (!Array.isArray(t.drills) || t.drills.length === 0) throw new Error(`themes[${i}].drills must be a non-empty array`);
  }
  return arr;
}

// ---- main ---------------------------------------------------------------
async function main() {
  const themes = await loadThemes(args.themes);
  const port = process.env.PORT ? Number(process.env.PORT) : await findFreePort();
  BASE_URL = `http://127.0.0.1:${port}`;
  console.log(`appDir=${APP_DIR}`);
  console.log(`port=${port} orientation=${ORIENTATION} recentDays=${RECENT_DAYS} drillPer=${DRILL_PER} dryRun=${DRY_RUN}`);

  await startServer(port);
  await waitServerReady();

  const recent = await loadRecentTopics();
  console.log(`Loaded ${recent.length} topic(s) from history within ${RECENT_DAYS} days.`);

  const planned = [];
  for (const theme of themes) {
    const { dup, against } = isDuplicate(theme, recent);
    if (dup) { console.log(`SKIP  "${theme.topic}"  (recent duplicate of "${against}")`); continue; }
    planned.push(theme);
    console.log(`BUILD "${theme.topic}"  (+${Math.min(DRILL_PER, theme.drills.length)} drilldowns)`);
  }

  if (DRY_RUN) { console.log('\n[dry-run] nothing created.'); return; }
  if (planned.length === 0) { console.log('\nNothing to build — all themes are recent duplicates.'); return; }

  const results = [];
  for (const theme of planned) {
    console.log(`\n=== Creating: ${theme.topic} ===`);
    const created = await api('POST', '/api/canvas', {
      topic: theme.topic,
      branches: theme.branches || 5,
      orientation: ORIENTATION,
      webSearch: true,
      lang: 'zh',
    });
    const canvasId = created.canvasId;
    console.log(`  canvasId=${canvasId}`);

    const tree = await waitForNodes(canvasId, 1, { label: 'root', timeoutMs: 600_000 });
    const rootHash = tree.root;
    const labels = theme.drills.slice(0, DRILL_PER);
    console.log(`  root=${rootHash} ready, firing ${labels.length} drilldowns...`);

    // 3-column anchor grid so leader lines don't overlap.
    const pts = labels.map((_, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      return [0.2 + col * 0.3, 0.18 + row * 0.18];
    });
    for (let i = 0; i < labels.length; i++) {
      try {
        const [x, y] = pts[i];
        await clickWithLabel(canvasId, rootHash, x, y, labels[i]);
        console.log(`    + ${labels[i]}`);
      } catch (e) {
        console.error(`    ! ${labels[i]} failed: ${e.message}`);
      }
      await sleep(800);
    }

    const target = 1 + Math.max(1, Math.floor(labels.length * 0.8));
    await waitForNodes(canvasId, target, { label: 'drilldowns', timeoutMs: 1_800_000 });
    // Settle until the node count stops growing (max ~5 min).
    let finalCount = 0;
    const settleStart = Date.now();
    while (Date.now() - settleStart < 300_000) {
      const t = await getTree(canvasId);
      const c = Object.keys(t.nodes || {}).length;
      if (c === finalCount && c >= target) break;
      finalCount = c;
      await sleep(8000);
    }
    console.log(`  done: ${finalCount} nodes (canvasId=${canvasId})`);

    results.push({
      canvasId,
      topic: theme.topic,
      aliases: theme.aliases || [],
      orientation: ORIENTATION,
      nodeCount: finalCount,
    });
  }

  // Dated history record — NO url (port is ephemeral, server gets killed).
  const dir = path.join(HISTORY_DIR, dateTimeDir());
  await fs.mkdir(dir, { recursive: true });
  const record = {
    timestamp: new Date().toISOString(),
    orientation: ORIENTATION,
    recentDaysWindow: RECENT_DAYS,
    canvases: results,
  };
  await fs.writeFile(path.join(dir, 'run.json'), JSON.stringify(record, null, 2));
  console.log(`\nHistory written: ${path.relative(APP_DIR, path.join(dir, 'run.json'))}`);
  console.log('\nGenerated canvases (under server/data/canvases/):');
  for (const r of results) console.log(`  ${r.nodeCount} nodes  ${r.canvasId}  (${r.topic})`);
}

main()
  .then(() => { shutdown(); process.exit(0); })
  .catch((e) => { console.error('\nFATAL:', e.message); shutdown(); process.exit(1); });
