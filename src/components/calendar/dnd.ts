import { pointerWithin, type CollisionDetection, type KeyboardCoordinateGetter } from "@dnd-kit/core";

/**
 * Keyboard drag state shared by the coordinate getter and the collision detection (a ref, set in onDragStart):
 * the card's current day, its earliest legal day (request day) and the day the keyboard has moved it to.
 */
export type KeyboardDrag = { day: string; min: string; target: string | null };

const STEP: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };

/** `YYYY-MM-DD` plus `n` days (UTC noon, so no time zone can shift the date). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}

/** First day after `from`, stepping `step` days, that is a legal target; null when the grid edge comes first. */
export function nextEnabledDay(from: string, step: number, min: string, enabled: (day: string) => boolean | undefined): string | null {
  for (let d = addDays(from, step); ; d = addDays(d, step)) {
    const ok = enabled(d);
    if (ok === undefined) return null;
    if (ok && d >= min) return d;
  }
}

/**
 * Arrow keys move the lifted card one day (left/right) or one week (up/down), skipping disabled days and never
 * leaving the grid. The target is decided by day id, not by geometry; the overlay is moved onto that cell.
 */
export function dayKeyboardCoordinates(drag: { current: KeyboardDrag | null }): KeyboardCoordinateGetter {
  return (event, { context: { droppableRects, droppableContainers } }) => {
    const step = STEP[event.code];
    const state = drag.current;
    if (!step || !state) return undefined;
    event.preventDefault();
    const to = nextEnabledDay(state.target ?? state.day, step, state.min, (d) => {
      const c = droppableContainers.get(d);
      return c ? !c.disabled : undefined;
    });
    const rect = to ? droppableRects.get(to) : undefined;
    if (!to || !rect) return undefined;
    state.target = to;
    return { x: rect.left + 8, y: rect.top + 8 };
  };
}

/** Keyboard drags are over the day the arrow keys chose; pointer and touch drags are over the cell under the pointer. */
export function dayCollisions(drag: { current: KeyboardDrag | null }): CollisionDetection {
  return (args) => {
    const target = drag.current?.target;
    if (target && !args.pointerCoordinates) return args.droppableContainers.some((c) => c.id === target) ? [{ id: target }] : [];
    return pointerWithin(args);
  };
}

/**
 * One drag controller per calendar: the dnd-kit callbacks plus `start`/`stop` for onDragStart/End. Keeps the shared
 * state out of React (dnd-kit reads it while dragging, never during render).
 */
export function createDayDrag() {
  const drag: { current: KeyboardDrag | null } = { current: null };
  return {
    coordinateGetter: dayKeyboardCoordinates(drag),
    collisionDetection: dayCollisions(drag),
    /** Keyboard drags start "over" the card's own day; pointer drags follow the pointer. */
    start(day: string, min: string, keyboard: boolean) { drag.current = { day, min, target: keyboard ? day : null }; },
    stop() { drag.current = null; },
  };
}
