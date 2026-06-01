// Hotspot layout helpers.
//
// The server supplies, per hotspot, a `leader_xy` (the dot anchored on the
// picture) and an `anchor_xy` hint for where the label card should sit. Cards
// may still overlap when densely placed, so we run a client-side pass to
// resolve conflicts with two goals, in priority order:
//   1) The label stays as CLOSE AS POSSIBLE to its OWN dot (leader_xy).
//   2) Leader lines don't cross each other.
// We never move the dot (leader endpoint) — only the card.
//
// Strategy: for each hotspot we generate candidate card positions on rings of
// increasing radius around its dot (seeded from the server hint's direction),
// then pick the non-overlapping candidate with the lowest cost, where cost
// strongly penalises leader-line crossings and otherwise prefers the position
// closest to the dot.

import type { Hotspot } from '../state/types';

// Card dimensions in PERCENT of stage width / height (0..1).
const CARD_W = 0.18;     // ~ 18% of stage width
const CARD_H = 0.06;     // ~ 6% of stage height (single-line label)
const PADDING = 0.012;   // gap between cards
// Keep the card a little off its dot so the leader line is visible and the
// card never sits on top of the point it labels.
const MIN_DIST = 0.05;
// A crossing costs this much "distance" — far more than any real
// dot-to-card distance (which is < ~1.0), so a crossing-free placement always
// beats a crossing one.
const CROSS_PENALTY = 10;

type Rect = { x: number; y: number; w: number; h: number };

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Build a card rect from its CENTER (cx, cy).
function rectAtCenter(cx: number, cy: number): Rect {
  return { x: cx - CARD_W / 2, y: cy - CARD_H / 2, w: CARD_W, h: CARD_H };
}

function overlaps(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w + PADDING <= b.x ||
    b.x + b.w + PADDING <= a.x ||
    a.y + a.h + PADDING <= b.y ||
    b.y + b.h + PADDING <= a.y
  );
}

// Where a leader line from the card touches the card's bounding-box edge,
// heading toward the dot (lx, ly). Mirrors Canvas.tsx's attachPoint so the
// crossing test reflects what's actually drawn.
function attachPoint(r: Rect, lx: number, ly: number): [number, number] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = lx - cx;
  const dy = ly - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const tx = dx === 0 ? Infinity : (r.w / 2) / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (r.h / 2) / Math.abs(dy);
  const t = Math.min(tx, ty);
  return [cx + dx * t, cy + dy * t];
}

// Standard segment-intersection test (proper crossings; collinear/touch at an
// endpoint doesn't count as a crossing for our purposes).
function segmentsCross(
  a: [number, number], b: [number, number],
  c: [number, number], d: [number, number],
): boolean {
  const o = (p: [number, number], q: [number, number], r: [number, number]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const o1 = o(a, b, c);
  const o2 = o(a, b, d);
  const o3 = o(c, d, a);
  const o4 = o(c, d, b);
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

type Placed = { rect: Rect; dot: [number, number]; attach: [number, number] };

export function layOutHotspots(
  hotspots: Hotspot[],
): { anchor: [number, number]; leader: [number, number]; idx: number }[] {
  const placed: Placed[] = [];
  const out: { anchor: [number, number]; leader: [number, number]; idx: number }[] = [];

  // Center bounds so the whole card stays on-stage.
  const cxLo = 0.01 + CARD_W / 2;
  const cxHi = 0.99 - CARD_W / 2;
  const cyLo = 0.01 + CARD_H / 2;
  const cyHi = 0.99 - CARD_H / 2;

  hotspots.forEach((h, idx) => {
    const lx = clamp(h.leader_xy?.[0] ?? h.anchor_xy?.[0] ?? 0.5, 0, 1);
    const ly = clamp(h.leader_xy?.[1] ?? h.anchor_xy?.[1] ?? 0.5, 0, 1);

    // Server hint center (anchor_xy is the card's top-left) → seed direction.
    const hintCx = (h.anchor_xy?.[0] ?? lx) + CARD_W / 2;
    const hintCy = (h.anchor_xy?.[1] ?? ly) + CARD_H / 2;
    let baseAngle = Math.atan2(hintCy - ly, hintCx - lx);
    if (!Number.isFinite(baseAngle)) baseAngle = -Math.PI / 4;

    // Candidate centers: the server hint first (so a good, already-free hint is
    // honoured exactly), then rings of growing radius around the dot. Angles
    // spiral outward from the hint direction so we prefer the server's side.
    const candidates: [number, number][] = [[hintCx, hintCy]];
    const ANGLE_STEPS = 16;
    for (let r = MIN_DIST; r <= 0.36; r += 0.03) {
      for (let i = 0; i < ANGLE_STEPS; i++) {
        // 0, +1, -1, +2, -2 … steps away from baseAngle.
        const k = Math.ceil(i / 2) * (i % 2 === 0 ? 1 : -1);
        const ang = baseAngle + k * ((2 * Math.PI) / ANGLE_STEPS);
        candidates.push([lx + r * Math.cos(ang), ly + r * Math.sin(ang)]);
      }
    }

    let best: { rect: Rect; attach: [number, number]; cx: number; cy: number } | null = null;
    let bestCost = Infinity;
    for (const [rawCx, rawCy] of candidates) {
      const cx = clamp(rawCx, cxLo, cxHi);
      const cy = clamp(rawCy, cyLo, cyHi);
      const rect = rectAtCenter(cx, cy);
      if (placed.some((p) => overlaps(rect, p.rect))) continue;
      const attach = attachPoint(rect, lx, ly);
      let crossings = 0;
      for (const p of placed) {
        if (segmentsCross([lx, ly], attach, p.dot, p.attach)) crossings++;
      }
      const dist = Math.hypot(cx - lx, cy - ly);
      const cost = crossings * CROSS_PENALTY + dist;
      if (cost < bestCost) {
        bestCost = cost;
        best = { rect, attach, cx, cy };
      }
    }

    // Fallback: every candidate overlapped — keep the clamped server hint so
    // we still render the card (rare; very dense diagrams).
    if (!best) {
      const cx = clamp(hintCx, cxLo, cxHi);
      const cy = clamp(hintCy, cyLo, cyHi);
      const rect = rectAtCenter(cx, cy);
      best = { rect, attach: attachPoint(rect, lx, ly), cx, cy };
    }

    placed.push({ rect: best.rect, dot: [lx, ly], attach: best.attach });
    out.push({ anchor: [best.rect.x, best.rect.y], leader: [lx, ly], idx });
  });

  return out;
}
