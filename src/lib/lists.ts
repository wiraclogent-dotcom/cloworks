import type { PrismaClient } from "@prisma/client";

/**
 * Pickers for new work list active brands and divisions only; a record being edited keeps its own archived one
 * (spec 2026-10-23). `current` is that record's brand or division id.
 */
export function activeOr(current?: string | null) {
  return { OR: [{ archivedAt: null }, ...(current ? [{ id: current }] : [])] };
}

type ListsDb = Pick<PrismaClient, "brand" | "division">;

export type ListOption = { id: string; name: string; archived: boolean };

/** Brands for a picker: active ones, plus the archived ones in `keepIds` (still used by the records shown), labelled. */
export async function brandOptions(db: ListsDb, keepIds: readonly (string | null | undefined)[] = []): Promise<ListOption[]> {
  const keep = [...new Set(keepIds.filter((id): id is string => !!id))];
  const rows = await db.brand.findMany({
    where: { OR: [{ archivedAt: null }, ...(keep.length ? [{ id: { in: keep } }] : [])] },
    orderBy: { name: "asc" }, select: { id: true, name: true, archivedAt: true },
  });
  return rows.map((b) => ({ id: b.id, name: b.archivedAt ? `${b.name} (archived)` : b.name, archived: b.archivedAt !== null }));
}

/** Divisions a new request can come from. */
export function divisionOptions(db: ListsDb): Promise<{ id: string; name: string }[]> {
  return db.division.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** What a form offers: every active option, and an archived one only when it is the record's current value. */
export function visibleOptions<T extends { id: string; archived?: boolean }>(options: readonly T[], currentId: string | null | undefined): T[] {
  return options.filter((o) => !o.archived || o.id === currentId);
}
