// One-off: synthesise Edge narration for already-generated canvases that
// predate the voice feature. Walks each canvas's tree and resynthesises every
// node with the given voice (default: language default). Idempotent — re-runs
// just overwrite the mp3s.
//
//   node scripts/synth-audio.mjs <canvasId> [<canvasId> ...] [--voice zh-CN-XiaoxiaoNeural]

import { getCanvas } from '../server/src/store/canvasStore.js';
import { resynthesizeCanvasAudio } from '../server/src/generation/pipeline.js';
import { DEFAULT_VOICE } from '../server/src/generation/audio.js';

const args = process.argv.slice(2);
let voice = null;
const ids = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--voice') { voice = args[++i]; continue; }
  ids.push(args[i]);
}
if (!ids.length) {
  console.error('usage: node scripts/synth-audio.mjs <canvasId> [...] [--voice <ShortName>]');
  process.exit(1);
}
const useVoice = voice || DEFAULT_VOICE.zh;

for (const id of ids) {
  const canvas = await getCanvas(id);
  if (!canvas) { console.error(`! ${id}: not found, skipping`); continue; }
  process.stdout.write(`→ ${id} (${canvas.topic}) with ${useVoice} … `);
  try {
    const r = await resynthesizeCanvasAudio(canvas, useVoice);
    console.log(`ok=${r.ok} updated=${r.updated} failed=${r.failed}`);
  } catch (e) {
    console.log(`ERROR ${e?.message}`);
  }
}
console.log('done.');
process.exit(0);
