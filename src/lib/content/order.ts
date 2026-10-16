import { jakartaDate } from "@/lib/createRequest";

const DAY_MS = 86_400_000;

type Tile = { id: string; plannedAt: Date | null };

// Top of the list has the highest position.
export function positionBetween(above: number | null, below: number | null): number {
  if (above === null && below === null) return 0;
  if (above === null) return below! + 1;
  if (below === null) return above - 1;
  return (above + below) / 2;
}

// Floats ran out of room between two neighbours: renumber the whole list.
export function needsRenumber(above: number | null, below: number | null): boolean {
  return above !== null && below !== null && Math.abs(above - below) < 1e-6;
}

export function renumber(ids: string[]): { id: string; position: number }[] {
  return ids.map((id, i) => ({ id, position: ids.length - 1 - i }));
}

// Jakarta YYYY-MM-DD strings sort chronologically, so plain string comparison is enough.
export function outOfOrder(tiles: Tile[]): Set<string> {
  const flagged = new Set<string>();
  let prev: string | null = null;
  for (const t of tiles) {
    if (!t.plannedAt) continue;
    const day = jakartaDate(t.plannedAt);
    if (prev !== null && day > prev) flagged.add(t.id);
    prev = day;
  }
  return flagged;
}

const dayNumber = (ymd: string) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
const fromDayNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

// Date that would put tile `id` back in order, from its nearest dated neighbours.
export function suggestDate(tiles: Tile[], id: string): string | null {
  const i = tiles.findIndex((t) => t.id === id);
  if (i < 0) return null;
  const dated = (t: Tile | undefined) => (t?.plannedAt ? dayNumber(jakartaDate(t.plannedAt)) : null);
  const above = dated(tiles.slice(0, i).reverse().find((t) => t.plannedAt));
  const below = dated(tiles.slice(i + 1).find((t) => t.plannedAt));
  if (above !== null && below !== null) return fromDayNumber(Math.floor((above + below) / 2));
  if (above !== null) return fromDayNumber(above - 1);
  if (below !== null) return fromDayNumber(below + 1);
  return null;
}
