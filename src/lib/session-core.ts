import type { AppRole, JobRole, PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "user">;
export type SessionUser = { id: string; appRole: AppRole; jobRole: JobRole };

export async function loadActiveUser(db: Db, id: string): Promise<SessionUser | null> {
  const u = await db.user.findUnique({ where: { id }, select: { id: true, active: true, appRole: true, jobRole: true } });
  if (!u || !u.active) return null;
  return { id: u.id, appRole: u.appRole, jobRole: u.jobRole };
}

/** jwt-callback refresh for an existing token: re-reads the DB; null invalidates the session. */
export async function refreshJwt<T extends { uid?: string; appRole?: AppRole; jobRole?: JobRole }>(
  db: Db,
  token: T,
): Promise<T | null> {
  if (!token.uid) return token;
  const u = await loadActiveUser(db, token.uid);
  if (!u) return null;
  token.appRole = u.appRole;
  token.jobRole = u.jobRole;
  return token;
}

/** Authoritative current user from the DB. Throws when unauthenticated, missing or inactive. */
export async function requireUserWith(
  getSession: () => Promise<{ user?: { id?: string } | null } | null>,
  db: Db,
): Promise<SessionUser> {
  const id = (await getSession())?.user?.id;
  if (!id) throw new Error("Unauthenticated");
  const u = await loadActiveUser(db, id);
  if (!u) throw new Error("Unauthenticated");
  return u;
}
