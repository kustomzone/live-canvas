import { forwardRef, useEffect, useRef, useState } from 'react';
import styles from '../styles/HotspotCard.module.css';
import { pct } from '../lib/geometry';
import type { Hotspot } from '../state/types';
import { Icon } from './Icon';

type Props = {
  hotspot: Hotspot;
  index: number;
  anchor: [number, number];
  onClick: (index: number) => void;
  // When provided, a small ✕ appears in the card's top-right on hover.
  // Hidden in preview / read-only mode by simply not passing this prop.
  onDelete?: (index: number) => void;
  // The linked child node is still generating (persisted early, streaming).
  // Renders the card as in-progress (dashed + spinner) even though next_hash
  // is already set.
  generating?: boolean;
  // --- Edit mode ---
  // When true the card is draggable + its label is renamable inline, and a
  // plain click no longer drills into the child.
  editMode?: boolean;
  dragging?: boolean;
  onRename?: (index: number, label: string) => void;
  onDragStart?: (index: number, e: React.PointerEvent) => void;
  onDragMove?: (index: number, e: React.PointerEvent) => void;
  onDragEnd?: (index: number) => void;
};

export const HotspotCard = forwardRef<HTMLButtonElement, Props>(function HotspotCard(
  { hotspot, index, anchor, onClick, onDelete, generating = false,
    editMode = false, dragging = false, onRename, onDragStart, onDragMove, onDragEnd }: Props,
  ref,
) {
  // A card reads as "linked/complete" only when it points at a FINISHED child.
  // While the child is still generating we keep the in-progress (spinner +
  // dashed) treatment so the catalog/canvas don't imply it's done.
  const linked = !!hotspot.next_hash && !generating;
  // Inline label editing (edit mode). Local draft committed on blur / Enter.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(hotspot.label || '');
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Did the pointer move during a press? Used to tell a click (drill / start
  // rename) apart from the end of a drag.
  const movedRef = useRef(false);

  useEffect(() => { setDraft(hotspot.label || ''); }, [hotspot.label]);
  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  const cls = [
    styles.hotspot,
    linked ? styles.linked : styles.pending,
    editMode ? styles.editable : '',
    dragging ? styles.dragging : '',
  ].filter(Boolean).join(' ');

  const commitRename = () => {
    setEditing(false);
    if (onRename) onRename(index, draft);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={cls}
      style={{ left: pct(anchor[0]), top: pct(anchor[1]) }}
      // Stop the pointerdown BEFORE it reaches the stage so the stage doesn't
      // start its long-press timer (and doesn't setPointerCapture, which would
      // swallow our subsequent click).
      onPointerDown={(e) => {
        e.stopPropagation();
        if (editMode && !editing) {
          movedRef.current = false;
          onDragStart?.(index, e);
        }
      }}
      onPointerMove={(e) => {
        if (editMode && !editing && onDragMove) {
          movedRef.current = true;
          onDragMove(index, e);
        }
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        if (editMode && !editing) onDragEnd?.(index);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (editMode) {
          // A click that wasn't a drag → start inline rename.
          if (!movedRef.current && !editing) setEditing(true);
          return;
        }
        onClick(index);
      }}
    >
      {!linked && !editMode && <span className={styles.spinner} aria-hidden />}
      {editing ? (
        <input
          ref={inputRef}
          className={styles.labelInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
            else if (e.key === 'Escape') { e.preventDefault(); setDraft(hotspot.label || ''); setEditing(false); }
          }}
          maxLength={80}
        />
      ) : (
        <span className={styles.label}>{hotspot.label}</span>
      )}
      {/* Delete ✕ button. For LINKED hotspots (real child node generated)
          this is the destructive cascade-delete path. For PENDING ones
          (still generating, next_hash null) it's a "cancel this in-flight
          click" — same affordance, the App-side handler distinguishes
          the two cases. Only hidden in read-only / preview mode. */}
      {onDelete && !editing && (
        <span
          className={styles.delete}
          role="button"
          tabIndex={0}
          aria-label={linked ? `Delete ${hotspot.label}` : `Cancel ${hotspot.label}`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete(index);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onDelete(index);
            }
          }}
          title={linked ? 'Delete this branch / 删除该分支' : 'Cancel this generation / 取消生成'}
        >
          <Icon name="close" size={11} strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
});
