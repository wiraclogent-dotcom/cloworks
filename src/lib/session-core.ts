import type { AppRole, JobRole, PrismaClient } from "@prisma/client";

import { DEFAULT_ALLOWED_DOMAIN, isAllowedEmail } from "./signin";

type Db = Pick<PrismaClient, "user" | "allowedEmail">;
export type SessionUser = { id: string; appRole: AppRole; jobRole: JobRole };

/**
 * Current, still-permitted user or null. Denies inactive users, users with no login email, and users whose
 * email is no longer permitted (not on the company domain and not on the allow-list), so revoking access
 * takes effect on the next request rather than when the JWT expires.
 */
export async function loadActiveUser(
  db: Db,
  id: string,
  domain: string = process.env.ALLOWED_EMAIL_DOMAIN || DEFAULT_ALLOWED_DOMAIN,
): Promise<SessionUser | null> {
  const u = await db.user.findUnique({ where: { id }, select: { id: true, active: true, email: true, appRole: true, jobRole: true } });
  if (!u || !u.active || !u.email) return null;
  const email = u.email.trim().toLowerCase();
  if (!isAllowedEmail(email, domain, [])) {
    const row = await db.allowedEmail.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
    if (!row) return null;
  }
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
