import type { RequestStatus } from "@prisma/client";
import { STATUS_LABEL } from "./statusLabels";

type Id = string | number;
type Ref = { id: Id };
type Evt = { active: Ref; over: Ref | null };

/** Stable id so server and client render the same dnd-kit `aria-describedby` (avoids a hydration mismatch). */
export const BOARD_DND_ID = "request-board";

export const SCREEN_READER_INSTRUCTIONS =
  "To pick up a card, press Space or Enter. Use the left and right arrow keys to move between columns. Press Space or Enter again to drop it, or Escape to cancel.";

/** Plain-language live-region messages: card title and status labels, never ids or enum values. */
export function buildAnnouncements(titleOf: (id: Id) => string | undefined) {
  const name = (id: Id) => `“${titleOf(id) ?? "Request"}”`;
  const col = (id: Id | undefined) => (id !== undefined && id in STATUS_LABEL ? STATUS_LABEL[id as RequestStatus] : undefined);
  return {
    onDragStart: ({ active }: { active: Ref }) => `Picked up ${name(active.id)}. Press arrow keys to move between columns.`,
    onDragOver: ({ active, over }: Evt) => {
      const label = col(over?.id);
      return label ? `${name(active.id)} is over ${label}.` : `${name(active.id)} is not over a column.`;
    },
    onDragEnd: ({ active, over }: Evt) => {
      const label = col(over?.id);
      return label ? `${name(active.id)} moved to ${label}.` : `${name(active.id)} was dropped outside the columns. Nothing changed.`;
    },
    onDragCancel: ({ active }: { active: Ref }) => `Move cancelled. ${name(active.id)} stays where it was.`,
  };
}
