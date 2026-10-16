// Client-safe helpers for requests with several assignees. No Prisma import at runtime.

/** Stable order for a request's assignees: who was added first, then by id as a tie-break. */
export const ASSIGNEE_ORDER = [{ addedAt: "asc" }, { userId: "asc" }] as const;

export type AssigneeRef = { id: string; name: string };
/** A picker option. `offTeam`: a current assignee who is not on the creative team (adding them would be refused). */
export type AssigneeOption = AssigneeRef & { offTeam?: true };

/** Short text for a list of assignee names: "", "A", "A & B", or "N people". */
export function assigneeLabel(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.length} people`;
}
