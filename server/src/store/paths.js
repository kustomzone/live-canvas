import path from 'node:path';
import { config } from '../config.js';

export const paths = {
  canvasesRoot: () => path.join(config.dataDir, 'canvases'),
  canvasDir: (id) => path.join(config.dataDir, 'canvases', id),
  manifestPath: (id) => path.join(paths.canvasDir(id), 'manifest.json'),
  treePath: (id) => path.join(paths.canvasDir(id), 'data', 'tree.json'),
  pendingPath: (id) => path.join(paths.canvasDir(id), 'pending.json'),
  nodeDir: (id) => path.join(paths.canvasDir(id), 'data', 'nodes'),
  nodePath: (id, hash) => path.join(paths.nodeDir(id), `${hash}.json`),
  imageDir: (id) => path.join(paths.canvasDir(id), 'images'),
  imagePath: (id, hash, ext = 'png') => path.join(paths.imageDir(id), `${hash}.${ext}`),
  // Synthesised narration audio (Edge neural voices). Filename: <hash>.mp3.
  audioDir: (id) => path.join(paths.canvasDir(id), 'audio'),
  audioPath: (id, hash, ext = 'mp3') => path.join(paths.audioDir(id), `${hash}.${ext}`),
  // User-uploaded source images attached to a node (canvas creation seed
  // or per-click drilldown attachment). Filename: <jobId>.<ext>.
  uploadDir: (id) => path.join(paths.canvasDir(id), 'uploads'),
  uploadPath: (id, basename) => path.join(paths.uploadDir(id), basename),
  // Cached voice preview (试听) samples. Canvas-independent — keyed by
  // (lang, voice) so a sample is synthesised once and reused across books.
  // Filename: <lang>-<voice>.<ext> (voice = Edge ShortName, ext = mp3).
  previewDir: () => path.join(config.dataDir, 'voice-previews'),
  previewPath: (lang, voice, ext) => path.join(paths.previewDir(), `${lang}-${voice}.${ext}`),
};

// Validators (used by routes to prevent path traversal)
const SAFE = /^[A-Za-z0-9_-]+$/;
export function isSafeId(id) { return typeof id === 'string' && SAFE.test(id) && id.length <= 64; }
export function isSafeHash(h) { return typeof h === 'string' && /^[a-f0-9]{12}$/.test(h); }
