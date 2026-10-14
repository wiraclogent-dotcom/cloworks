// Client-safe helpers for requests with several assignees. No Prisma import at runtime.

/** Stable order for a request's assignees: who was added first, then by id as a tie-break. */
export const ASSIGNEE_ORDER = [{ addedAt: "asc" }, { userId: "asc" }] as const;

export type AssigneeRef = { id: string; name: string };

/** Short text for a list of assignee names: "", "A", "A & B", or "N people". */
export function assigneeLabel(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.length} people`;
}

/** User ids to add and to remove to turn `current` into `next` (`next` is deduped). */
export function addedAndRemoved(current: string[], next: string[]): { added: string[]; removed: string[] } {
  const want = [...new Set(next)];
  const have = new Set(current);
  const wanted = new Set(want);
  return {
    added: want.filter((id) => !have.has(id)),
    removed: current.filter((id) => !wanted.has(id)),
  };
}
