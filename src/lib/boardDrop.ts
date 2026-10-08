import type { RequestStatus } from "@prisma/client";
import { canTransition } from "./workflow";

export type DropDecision =
  | { kind: "noop" }
  | { kind: "illegal" }
  | { kind: "needs-assignee" }
  | { kind: "needs-done-details" }
  | { kind: "move" };

/**
 * What a drop of a card on a column should do. Pure so every case is unit-tested without simulating drag events.
 * "illegal" is still sent to the server by the caller so the user sees its human-readable message.
 */
export function decideDrop({ from, to, hasAssignee, canMove }: {
  from: RequestStatus; to: RequestStatus; hasAssignee: boolean; canMove: boolean;
}): DropDecision {
  if (!canMove || from === to) return { kind: "noop" };
  if (!canTransition(from, to)) return { kind: "illegal" };
  if (to === "DONE") return hasAssignee ? { kind: "needs-done-details" } : { kind: "needs-assignee" };
  return { kind: "move" };
}
