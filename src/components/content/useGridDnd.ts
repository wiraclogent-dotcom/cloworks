"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent, type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import type { ContentStatus } from "@prisma/client";
import { movePost } from "@/app/(app)/content/actions";
import type { TileView } from "@/lib/content/view";

/** Stable id so server and client render the same dnd-kit `aria-describedby` (avoids a hydration mismatch). */
export const GRID_DND_ID = "content-grid";

export const GRID_INSTRUCTIONS =
  "To pick up a post, press Space or Enter. Use the arrow keys to move it through the plan. Press Space or Enter again to drop it, or Escape to cancel.";

const DRAGGABLE: ReadonlySet<ContentStatus> = new Set(["IDEA", "DRAFT", "CHANGES_REQUESTED"]);

/** Only editable planned tiles can be reordered (the server rejects the rest), and only by drafters. */
export const isDraggable = (tile: TileView, canDraft: boolean) => canDraft && DRAGGABLE.has(tile.status);

/** `ids` with `id` taken out and put at index `to` (an index into the list that still contains it). */
export function reorder(ids: string[], id: string, to: number): string[] {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.min(Math.max(to, 0), rest.length), 0, id);
  return rest;
}

/** Top-to-bottom neighbours of `id` in `ids`; the list top is the highest position. */
export function neighbours(ids: string[], id: string): { aboveId: string | null; belowId: string | null } {
  const i = ids.indexOf(id);
  return { aboveId: ids[i - 1] ?? null, belowId: ids[i + 1] ?? null };
}

/** Plain-language live-region messages: the tile's label and its place in the plan, never ids. */
export function buildGridAnnouncements(labelOf: (id: string) => string, positionOf: (id: string) => { at: number; of: number } | null) {
  const place = (id: string | number | undefined) => {
    const p = id === undefined ? null : positionOf(String(id));
    return p ? `position ${p.at} of ${p.of}` : null;
  };
  return {
    onDragStart: ({ active }: { active: { id: string | number } }) =>
      `Picked up ${labelOf(String(active.id))}, ${place(active.id)}. Use the arrow keys to move it.`,
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => {
      const p = place(over?.id);
      return p ? `${labelOf(String(active.id))} is over ${p}.` : `${labelOf(String(active.id))} is not over the plan.`;
    },
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => {
      const p = place(over?.id);
      return p ? `${labelOf(String(active.id))} moved to ${p}.` : `${labelOf(String(active.id))} was dropped outside the plan. Nothing changed.`;
    },
    onDragCancel: ({ active }: { active: { id: string | number } }) => `Move cancelled. ${labelOf(String(active.id))} stays where it was.`,
  };
}

/** Keyboard drag state shared by the coordinate getter and the collision detection: the slot the arrows chose. */
type KeyboardDrag = { target: string };

/**
 * Drag-to-reorder for the planned tiles of one tab. Pointer, touch and keyboard share one path: the drop decides the
 * new order, the move is applied optimistically and sent to `movePost` with the tiles above and below, rolled back
 * with an inline message when the server refuses, and followed by a refresh when it accepts.
 *
 * `cols` is the grid's column count: ArrowUp/Down step one row, ArrowLeft/Right one tile.
 */
export function useGridDnd({ planned, cols, labelOf }: { planned: TileView[]; cols: number; labelOf: (tile: TileView) => string }) {
  const router = useRouter();
  const [seen, setSeen] = useState(planned);
  const [override, setOverride] = useState<string[] | null>(null);
  if (seen !== planned) { setSeen(planned); setOverride(null); }
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kb = useRef<KeyboardDrag | null>(null);
  const idsRef = useRef<string[]>([]);
  const focusId = useRef<string | null>(null);

  const tiles = useMemo(() => {
    if (!override) return planned;
    const byId = new Map(planned.map((t) => [t.id, t]));
    return override.map((id) => byId.get(id)).filter((t): t is TileView => !!t);
  }, [planned, override]);
  const ids = useMemo(() => tiles.map((t) => t.id), [tiles]);
  useEffect(() => { idsRef.current = ids; }, [ids]);

  // A reordered tile can lose focus when the DOM shuffles; hand it back to its drag handle so the keyboard user can go on.
  useEffect(() => {
    const id = focusId.current;
    if (!id) return;
    const active = document.activeElement;
    if (active && active !== document.body && document.contains(active)) { focusId.current = null; return; }
    const handle = document.querySelector<HTMLElement>(`[data-tile="${CSS.escape(id)}"] [data-handle]`);
    if (handle) { handle.focus(); focusId.current = null; }
  });

  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context: { droppableRects } }) => {
    const step = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : event.code === "ArrowDown" ? cols : event.code === "ArrowUp" ? -cols : 0;
    const state = kb.current;
    if (!step || !state) return undefined;
    event.preventDefault();
    const list = idsRef.current;
    const to = list[Math.min(Math.max(list.indexOf(state.target) + step, 0), list.length - 1)];
    const rect = to ? droppableRects.get(to) : undefined;
    if (!to || !rect) return undefined;
    state.target = to;
    return { x: rect.left + 8, y: rect.top + 8 };
  };
  /** Keyboard drags are over the slot the arrows chose; pointer and touch drags are over the nearest tile. */
  const collisionDetection: CollisionDetection = (args) => {
    const target = kb.current?.target;
    if (target && !args.pointerCoordinates) return args.droppableContainers.some((c) => c.id === target) ? [{ id: target }] : [];
    return closestCenter(args);
  };

  // Mouse (6px distance, so the tile link stays clickable) + touch (press-and-hold, so the page still scrolls) + keyboard.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  );

  const labels = useMemo(() => new Map(tiles.map((t) => [t.id, labelOf(t)])), [tiles, labelOf]);
  const announcements = useMemo(() => buildGridAnnouncements(
    (id) => `“${labels.get(id) ?? "Post"}”`,
    (id) => { const i = ids.indexOf(id); return i < 0 ? null : { at: i + 1, of: ids.length }; },
  ), [labels, ids]);

  async function drop(id: string, overId: string) {
    const from = ids.indexOf(id);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return;
    const previous = override;
    const next = reorder(ids, id, to);
    const { aboveId, belowId } = neighbours(next, id);
    focusId.current = id;
    setError(null);
    setOverride(next);
    setBusyId(id);
    try {
      const r = await movePost(id, aboveId, belowId);
      if (r.ok) router.refresh();
      else { setOverride(previous); setError(r.message); }
    } catch {
      setOverride(previous);
      setError("Could not move the post. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setActiveId(id);
    kb.current = e.activatorEvent instanceof KeyboardEvent ? { target: id } : null;
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    kb.current = null;
    if (e.over) void drop(String(e.active.id), String(e.over.id));
  }
  function onDragCancel() { setActiveId(null); kb.current = null; }

  return {
    tiles, activeTile: activeId ? tiles.find((t) => t.id === activeId) ?? null : null, busyId, error, dismissError: () => setError(null),
    dndProps: { id: GRID_DND_ID, sensors, collisionDetection, onDragStart, onDragEnd, onDragCancel, accessibility: { announcements, screenReaderInstructions: { draggable: GRID_INSTRUCTIONS } } },
  };
}
