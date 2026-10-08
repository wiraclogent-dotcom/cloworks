export type ImportUser = { id: string; name: string; fullName?: string | null; aliases: string[]; active: boolean };

/** Case-, whitespace- and punctuation-insensitive form used for all name matching. */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Resolves a sheet name to a user id via name, fullName or any alias. Inactive users resolve too
 * (history). A string matching two different users is ambiguous -> null; so is empty/unknown.
 */
export function resolveUser(name: string, users: ImportUser[]): string | null {
  const n = normalizeName(name ?? "");
  if (!n) return null;
  const hits = new Set<string>();
  for (const u of users) {
    const candidates = [u.name, u.fullName ?? "", ...u.aliases];
    if (candidates.some((c) => normalizeName(c) === n)) hits.add(u.id);
  }
  return hits.size === 1 ? [...hits][0] : null;
}
