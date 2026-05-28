import { useEffect, useMemo, useRef } from 'react';
import styles from '../styles/TextLayer.module.css';
import type { TextSpan } from '../state/types';

type Props = {
  spans: TextSpan[];
  /**
   * Bounding box of the actually-rendered image inside the stage, in CSS
   * percent of the stage (object-fit: contain may letterbox if aspect ratios
   * differ). When null we render nothing.
   */
  rect: { left: number; top: number; width: number; height: number } | null;
  /** Height of the stage in CSS pixels — needed to convert bbox-height (% of
   * stage) into a usable font-size in px. */
  stageHeightPx: number;
};

/**
 * Invisible HTML overlay over the generated image. Each span is positioned at
 * the OCR-detected bounding box and contains the recognised text with
 * `color: transparent`. The painted pixels remain the visual ground truth;
 * users select / copy the underlying real Unicode text.
 *
 * pointer-events:
 *   - wrapper has `pointer-events: none` so empty regions still receive the
 *     stage's long-press handler;
 *   - individual spans set `pointer-events: text` so the cursor turns into a
 *     text-cursor and selection works;
 *   - each span carries `data-textspan="1"` so the parent's pointerdown
 *     handler can skip starting a long-press timer when the user is
 *     selecting text.
 */
export function TextLayer({ spans, rect, stageHeightPx }: Props) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const items = useMemo(() => {
    if (!rect || !spans?.length || stageHeightPx <= 0) return [];
    return spans.map((s, i) => {
      const [bx, by, bw, bh] = s.bbox;
      // Convert image-normalized bbox to absolute %-of-stage. The `rect` is
      // already expressed in % of the stage (left/top/width/height).
      const left = rect.left + bx * rect.width;
      const top = rect.top + by * rect.height;
      const width = bw * rect.width;
      const height = bh * rect.height;
      // Font-size in px: bbox height as fraction of stage × stageHeightPx.
      // We use the full bbox height as the font-size so the natural glyph
      // run is roughly bbox-sized; transform: scaleX in the layout effect
      // below shrinks the text horizontally to match the painted width
      // exactly (so the selection highlight box hugs the real text).
      const fontPx = Math.max(6, (height / 100) * stageHeightPx);
      return {
        key: i,
        text: s.text,
        style: {
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
          fontSize: `${fontPx.toFixed(2)}px`,
          // origin top-left so scale shrinks toward the bbox's top-left,
          // matching the painted text's anchor.
          transformOrigin: '0% 0%',
        } as React.CSSProperties,
      };
    });
  }, [spans, rect, stageHeightPx]);

  // After mount / on every spans change, measure each span's natural
  // scrollWidth and apply transform: scaleX so the invisible glyphs occupy
  // exactly the bbox width. This lets the selection highlight align with
  // the painted pixels even when the font/typeface differs.
  useEffect(() => {
    const root = layerRef.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLSpanElement>('span[data-textspan="1"]');
    els.forEach((el) => {
      // Reset before measuring so we don't compound previous scales.
      el.style.transform = '';
      const natural = el.scrollWidth;
      const target = el.clientWidth;
      if (natural <= 0 || target <= 0) return;
      const sx = target / natural;
      // Clamp to a sane range — extreme scales mean OCR/bbox mismatch
      // (e.g. very long text in a tiny box) and still won't be readable;
      // we just leave them at native size in that case.
      if (sx > 0.05 && sx < 20) {
        el.style.transform = `scaleX(${sx.toFixed(4)})`;
      }
    });
  }, [items]);

  if (!items.length) return null;
  return (
    <div ref={layerRef} className={styles.layer} aria-hidden={false}>
      {items.map((it) => (
        <span
          key={it.key}
          className={styles.span}
          style={it.style}
          data-textspan="1"
        >
          {it.text}
        </span>
      ))}
    </div>
  );
}
