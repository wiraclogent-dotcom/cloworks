import { dayLabel } from "./calendar";

type Id = string | number;
type Ref = { id: Id };
type Evt = { active: Ref; over: Ref | null };

/** Stable id so server and client render the same dnd-kit `aria-describedby` (avoids a hydration mismatch). */
export const CALENDAR_DND_ID = "request-calendar";

export const CALENDAR_SR_INSTRUCTIONS =
  "To pick up a card, press Space or Enter. Use the arrow keys to move between days. Press Space or Enter again to drop it, or Escape to cancel.";

/** Plain-language live-region messages. Droppable ids are `YYYY-MM-DD`. */
export function buildCalendarAnnouncements(titleOf: (id: Id) => string | undefined, currentDayOf: (id: Id) => string | undefined = () => undefined) {
  const name = (id: Id) => `“${titleOf(id) ?? "Request"}”`;
  const day = (id: Id | undefined) => (typeof id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(id) ? dayLabel(id) : undefined);
  return {
    onDragStart: ({ active }: { active: Ref }) => `Picked up ${name(active.id)}. Use the arrow keys to move between days.`,
    onDragOver: ({ active, over }: Evt) => {
      const label = day(over?.id);
      return label ? `${name(active.id)} is over ${label}.` : `${name(active.id)} is not over a day.`;
    },
    onDragEnd: ({ active, over }: Evt) => {
      const label = day(over?.id);
      if (label && over && currentDayOf(active.id) === over.id) return `${name(active.id)} stays on ${label}. Nothing changed.`;
      return label ? `${name(active.id)} moved to ${label}.` : `${name(active.id)} was dropped outside the calendar. Nothing changed.`;
    },
    onDragCancel: ({ active }: { active: Ref }) => `Move cancelled. ${name(active.id)} stays where it was.`,
  };
}
