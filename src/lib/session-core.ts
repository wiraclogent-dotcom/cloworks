import type { AppRole, JobRole, PrismaClient } from "@prisma/client";

import { DEFAULT_ALLOWED_DOMAIN, isAllowedEmail } from "./signin";

type Db = Pick<PrismaClient, "user" | "allowedEmail">;
/** Thrown when there is no valid, still-permitted session. Message kept as "Unauthenticated" for older callers. */
export class UnauthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
    this.name = "UnauthenticatedError";
  }
}
export const isUnauthenticated = (e: unknown): boolean => e instanceof UnauthenticatedError || (e instanceof Error && e.message === "Unauthenticated");

/** Signed in, but must set a new password before doing anything else. Extends UnauthenticatedError so `withUser` refuses the user. */
export class PasswordChangeRequiredError extends UnauthenticatedError {
  constructor() {
    super();
    this.name = "PasswordChangeRequiredError";
  }
}

export type SessionUser = { id: string; name: string; appRole: AppRole; jobRole: JobRole; workspaceId: string; mustChangePassword: boolean };

/**
 * Current, still-permitted user or null. Denies inactive users, users with no login email, and users whose
 * email is no longer permitted (not on the company domain and not on the allow-list), so revoking access
 * takes effect on the next request rather than when the JWT expires.
 */
export async function loadActiveUser(
  db: Db,
  id: string,
  domain: string = process.env.ALLOWED_EMAIL_DOMAIN || DEFAULT_ALLOWED_DOMAIN,
  /**
   * When present, the session's `loginEmail` claim must match the user's CURRENT email (rebinding revokes), and its
   * password version (`pwv`, 0 for tokens issued before passwords existed) must match (a password change revokes).
   */
  claim?: { loginEmail?: string | null; pwv?: number },
): Promise<SessionUser | null> {
  const u = await db.user.findUnique({ where: { id }, select: { id: true, name: true, active: true, email: true, appRole: true, jobRole: true, passwordVersion: true, workspaceId: true, mustChangePassword: true } });
  if (!u || !u.active || !u.email) return null;
  const email = u.email.trim().toLowerCase();
  if (claim && (!claim.loginEmail || claim.loginEmail.trim().toLowerCase() !== email)) return null;
  if (claim && (claim.pwv ?? 0) !== u.passwordVersion) return null;
  if (!isAllowedEmail(email, domain, [])) {
    const row = await db.allowedEmail.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
    if (!row) return null;
  }
  return { id: u.id, name: u.name, appRole: u.appRole, jobRole: u.jobRole, workspaceId: u.workspaceId, mustChangePassword: u.mustChangePassword };
}

/**
 * Loads the active user for a session's claims. The app passes a per-request memoised loader so the jwt callback
 * and `requireUserWith` share one DB read; tests and scripts use the plain `loadActiveUser`.
 */
export type ActiveUserLoader = (db: Db, id: string, claim: { loginEmail?: string | null; pwv?: number }) => Promise<SessionUser | null>;
const loadUncached: ActiveUserLoader = (db, id, claim) => loadActiveUser(db, id, undefined, claim);

/** jwt-callback refresh for an existing token: re-reads the DB; null invalidates the session. */
export async function refreshJwt<T extends { uid?: string; loginEmail?: string; pwv?: number; appRole?: AppRole; jobRole?: JobRole }>(
  db: Db,
  token: T,
  load: ActiveUserLoader = loadUncached,
): Promise<T | null> {
  if (!token.uid) return token;
  const u = await load(db, token.uid, { loginEmail: token.loginEmail, pwv: token.pwv });
  if (!u) return null;
  token.appRole = u.appRole;
  token.jobRole = u.jobRole;
  return token;
}

/** Authoritative current user from the DB. Throws when unauthenticated, missing or inactive. */
export async function requireUserWith(
  getSession: () => Promise<{ user?: { id?: string; loginEmail?: string; pwv?: number } | null } | null>,
  db: Db,
  load: ActiveUserLoader = loadUncached,
): Promise<SessionUser> {
  const su = (await getSession())?.user;
  const id = su?.id;
  if (!id) throw new UnauthenticatedError();
  const u = await load(db, id, { loginEmail: su?.loginEmail, pwv: su?.pwv });
  if (!u) throw new UnauthenticatedError();
  return u;
}

/** Fresh sign-in: bind the token to the matched user and the exact email it was issued for. */
export function bindSignInToken<T extends { uid?: string; loginEmail?: string; pwv?: number; appRole?: AppRole; jobRole?: JobRole }>(
  token: T,
  user: { id: string; email: string | null; passwordVersion?: number; appRole: AppRole; jobRole: JobRole },
): T {
  token.uid = user.id;
  token.loginEmail = user.email?.trim().toLowerCase();
  token.pwv = user.passwordVersion ?? 0;
  token.appRole = user.appRole;
  token.jobRole = user.jobRole;
  return token;
}
