#!/usr/bin/env node
// list_recent_topics.mjs — list already-published topics for the SELECTION phase.
//
// Why: dedup used to happen only inside build_canvases.mjs (phase 2), which needs
// a running server and wastes the topic-picking effort when a theme gets SKIPped.
// This tiny script reads app/topics-history/*/run.json DIRECTLY (no server, no
// network) so the selection phase can see what was already published and avoid
// re-picking it up front.
//
// Usage:
//   node list_recent_topics.mjs                 # human-readable list, last 90 days
//   node list_recent_topics.mjs --json          # machine-readable JSON array
//   RECENT_DAYS=30 node list_recent_topics.mjs  # narrow the window
//   node list_recent_topics.mjs --app-dir /path/to/app
//
// Output (default): one line per published canvas, newest first:
//   [2026-06-03] 深海6000米：不该存在的生物  | aliases: 深海生物, 深渊生物, 深海冷知识

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const out = { appDir: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--app-dir') out.appDir = argv[++i];
    else if (a === '--json') out.json = true;
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
const RECENT_DAYS = Number(process.env.RECENT_DAYS || 90);

async function loadRecentTopics() {
  const cutoff = Date.now() - RECENT_DAYS * 24 * 3600 * 1000;
  const out = [];
  let dirs = [];
  try { dirs = await fs.readdir(HISTORY_DIR); } catch { return out; }
  for (const d of dirs) {
    const file = path.join(HISTORY_DIR, d, 'run.json');
    let rec;
    try { rec = JSON.parse(await fs.readFile(file, 'utf8')); } catch { continue; }
    const ts = Date.parse(rec.timestamp || '');
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    for (const c of rec.canvases || []) {
      out.push({
        date: new Date(ts).toISOString().slice(0, 10),
        ts,
        topic: c.topic,
        aliases: c.aliases || [],
      });
    }
  }
  // newest first
  out.sort((a, b) => b.ts - a.ts);
  return out;
}

async function main() {
  const recent = await loadRecentTopics();
  if (args.json) {
    // Drop the internal ts field; keep date/topic/aliases for downstream use.
    process.stdout.write(JSON.stringify(
      recent.map(({ date, topic, aliases }) => ({ date, topic, aliases })),
      null, 2,
    ) + '\n');
    return;
  }
  if (recent.length === 0) {
    console.log(`No published topics in the last ${RECENT_DAYS} day(s). Pick anything.`);
    return;
  }
  console.log(`Published in the last ${RECENT_DAYS} day(s) — AVOID re-picking these (${recent.length}):\n`);
  for (const r of recent) {
    const al = r.aliases.length ? `  | aliases: ${r.aliases.join(', ')}` : '';
    console.log(`[${r.date}] ${r.topic}${al}`);
  }
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
