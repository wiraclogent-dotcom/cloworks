import { FALLBACK_BRAND, type ImportRecord } from "./parseRequests";

/**
 * The Dimas log has no brand column. Each Dimas task gets the most common brand among the already
 * parsed NON-Dimas records of the same resolved requester; ties or no records fall back to Clogent.
 * Pure: returns new records (input untouched) and how many were inferred (all of them).
 */
export function inferBrands(
  dimasRecords: ImportRecord[],
  otherRecords: ImportRecord[],
  brands: { id: string; name: string }[],
): { records: ImportRecord[]; inferred: number } {
  const nameOf = new Map(brands.map((b) => [b.id, b.name]));
  const fallbackId = brands.find((b) => b.name.trim().toLowerCase() === FALLBACK_BRAND.toLowerCase())?.id;

  const counts = new Map<string, Map<string, number>>();
  for (const r of otherRecords) {
    if (r.source === "dimas") continue;
    const m = counts.get(r.requesterId) ?? new Map<string, number>();
    m.set(r.brandId, (m.get(r.brandId) ?? 0) + 1);
    counts.set(r.requesterId, m);
  }
  const pick = (requesterId: string, current: string): string => {
    const m = counts.get(requesterId);
    if (!m) return fallbackId ?? current;
    const sorted = [...m].sort((a, b) => b[1] - a[1]);
    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return fallbackId ?? current;
    return sorted[0][0];
  };

  const records = dimasRecords.map((r) => {
    const brandId = pick(r.requesterId, r.brandId);
    const note = `Brand not recorded in Dimas Tracker; inferred ${nameOf.get(brandId) ?? FALLBACK_BRAND}.`;
    return { ...r, brandId, notes: [r.notes, note].filter(Boolean).join("\n") };
  });
  return { records, inferred: records.length };
}
