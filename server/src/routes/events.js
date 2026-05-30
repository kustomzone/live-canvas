import express from 'express';
import { getCanvas } from '../store/canvasStore.js';
import { attach } from '../sse/hub.js';
import { isSafeId } from '../store/paths.js';
import { resumeIncomplete } from '../generation/resume.js';

export const eventsRouter = express.Router();

eventsRouter.get('/:id/events', async (req, res) => {
  const { id } = req.params;
  if (!isSafeId(id)) return res.status(400).json({ error: 'bad_id' });
  const runtime = await getCanvas(id);
  if (!runtime) return res.status(404).json({ error: 'not_found' });
  attach(runtime, res);
  // After the client is attached, look for any half-finished generation
  // jobs (parent hotspots whose target node is missing/imageless, or a
  // tree.root that never got its image written) and re-enqueue them so
  // the user's "still generating…" UI eventually receives node_ready.
  // Per-canvas dedupe inside resumeIncomplete() handles concurrent SSE
  // attaches.
  resumeIncomplete(runtime).catch(() => { /* logged inside */ });
});
