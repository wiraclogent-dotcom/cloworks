/**
 * Pickers for new work list active brands and divisions only; a record being edited keeps its own archived one
 * (spec 2026-10-23). `current` is that record's brand or division id.
 */
export function activeOr(current?: string | null) {
  return { OR: [{ archivedAt: null }, ...(current ? [{ id: current }] : [])] };
}
