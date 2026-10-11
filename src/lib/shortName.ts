import type { PrismaClient } from "@prisma/client";
import { normalizeName } from "./import/aliases";

/**
 * The short `name` used for @mentions, admin collision checks and import resolution. Keeps `display` unless it is
 * empty or collides with anyone's name/fullName/alias in the workspace; then falls back to the email local part,
 * with a numeric suffix (2, 3, ...) if that collides too.
 */
export async function pickShortName(db: Pick<PrismaClient, "user">, workspaceId: string, display: string, email: string): Promise<string> {
  const roster = await db.user.findMany({ where: { workspaceId }, select: { name: true, fullName: true, aliases: true } });
  const taken = new Set(roster.flatMap((u) => [u.name, u.fullName, ...u.aliases]).map(normalizeName));
  const free = (s: string) => !!normalizeName(s) && !taken.has(normalizeName(s));
  if (free(display)) return display;
  const base = email.split("@")[0].toLowerCase();
  if (free(base)) return base;
  let n = 2;
  while (!free(`${base}${n}`)) n++;
  return `${base}${n}`;
}
