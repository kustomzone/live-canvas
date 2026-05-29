import { useEffect, useRef } from 'react';
import type { SseEvent } from '../state/types';

export function useCanvasSSE(canvasId: string | null, onEvent: (evt: SseEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!canvasId) return;
    let stopped = false;
    let es: EventSource | null = null;
    let retry = 1000;

    const connect = () => {
      if (stopped) return;
      es = new EventSource(`/api/canvas/${canvasId}/events`);
      // Subscribe to every typed event the server emits. Missing one here
      // silently drops that event on the floor (EventSource only delivers
      // events we explicitly addListener to when the server sends an
      // `event:` field), so keep this list in sync with server/src/sse/events.js.
      const types = [
        'planning_started',
        'search_started', 'search_done',
        'planner_done',
        'image_started', 'image_ready',
        'ocr_done',
        'node_ready', 'tree_updated',
        'click_rejected', 'node_deleted',
        'error', 'done',
      ];
      for (const t of types) {
        es.addEventListener(t, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data) as SseEvent;
            handlerRef.current(data);
          } catch {
            // ignore malformed frame
          }
        });
      }
      es.onerror = () => {
        es?.close();
        if (stopped) return;
        setTimeout(connect, retry);
        retry = Math.min(retry * 2, 30_000);
      };
      es.onopen = () => { retry = 1000; };
    };

    connect();
    return () => {
      stopped = true;
      es?.close();
    };
  }, [canvasId]);
}
