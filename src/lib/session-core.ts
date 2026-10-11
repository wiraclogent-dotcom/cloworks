import type { AppRole, JobRole, PrismaClient } from "@prisma/client";

type Db = Pick<PrismaClient, "user">;
type TokenDb = Pick<PrismaClient, "user" | "applicant">;
/** Claims either token kind may carry: a member (`uid`) or an applicant (`aid`), never both. */
type TokenClaims = { uid?: string; aid?: string; loginEmail?: string; pwv?: number; appRole?: AppRole; jobRole?: JobRole };
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
 * Current, still-permitted user or null. Denies missing or inactive users and users with no login email, so
 * deactivating someone takes effect on the next request rather than when the JWT expires. An active User is the
 * whole grant: there is no email-domain or allow-list test.
 */
export async function loadActiveUser(
  db: Db,
  id: string,
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
  return { id: u.id, name: u.name, appRole: u.appRole, jobRole: u.jobRole, workspaceId: u.workspaceId, mustChangePassword: u.mustChangePassword };
}

/**
 * Loads the active user for a session's claims. The app passes a per-request memoised loader so the jwt callback
 * and `requireUserWith` share one DB read; tests and scripts use the plain `loadActiveUser`.
 */
export type ActiveUserLoader = (db: Db, id: string, claim: { loginEmail?: string | null; pwv?: number }) => Promise<SessionUser | null>;
const loadUncached: ActiveUserLoader = (db, id, claim) => loadActiveUser(db, id, claim);

/**
 * jwt-callback refresh for an existing token: re-reads the DB; null invalidates the session.
 * Member token: the user must still be active with matching claims. Applicant token (`aid`): once a User with that id
 * exists (approval reuses the applicant's id), is active and has the token's email, the token is upgraded to a member
 * token; otherwise the Applicant row must still exist with that email.
 */
export async function refreshJwt<T extends TokenClaims>(db: TokenDb, token: T, load: ActiveUserLoader = loadUncached): Promise<T | null> {
  if (token.aid && !token.uid) return refreshApplicantJwt(db, token);
  if (!token.uid) return token;
  const u = await load(db, token.uid, { loginEmail: token.loginEmail, pwv: token.pwv });
  if (!u) return null;
  token.appRole = u.appRole;
  token.jobRole = u.jobRole;
  return token;
}

const sameEmail = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

async function refreshApplicantJwt<T extends TokenClaims>(db: TokenDb, token: T): Promise<T | null> {
  const id = token.aid!;
  const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true, active: true, passwordVersion: true, appRole: true, jobRole: true } });
  if (user) return user.active && sameEmail(user.email, token.loginEmail) ? bindSignInToken(token, user) : null;
  const a = await db.applicant.findUnique({ where: { id }, select: { email: true } });
  return a && sameEmail(a.email, token.loginEmail) ? token : null;
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

/** Fresh sign-in: bind the token to the matched user and the exact email it was issued for. Drops any applicant claim. */
export function bindSignInToken<T extends TokenClaims>(
  token: T,
  user: { id: string; email: string | null; passwordVersion?: number; appRole: AppRole; jobRole: JobRole },
): T {
  delete token.aid;
  token.uid = user.id;
  token.loginEmail = user.email?.trim().toLowerCase();
  token.pwv = user.passwordVersion ?? 0;
  token.appRole = user.appRole;
  token.jobRole = user.jobRole;
  return token;
}

/** Fresh applicant sign-in: `aid` + `loginEmail` only, so nothing reads it as a member token. */
export function bindApplicantToken<T extends TokenClaims>(token: T, a: { id: string; email: string }): T {
  delete token.uid;
  delete token.appRole;
  delete token.jobRole;
  delete token.pwv;
  token.aid = a.id;
  token.loginEmail = a.email.trim().toLowerCase();
  return token;
}

export type SessionApplicant = { id: string; email: string; name: string };

/**
 * Classifies a session for applicant-only pages: a member session (has a user id), a valid applicant (row exists and
 * still has the session's email), or none.
 */
export async function loadSessionApplicant(
  db: Pick<PrismaClient, "applicant">,
  session: { user?: { id?: string; applicantId?: string; loginEmail?: string } | null } | null,
): Promise<{ kind: "member" } | { kind: "none" } | { kind: "applicant"; applicant: SessionApplicant }> {
  const su = session?.user;
  if (su?.id) return { kind: "member" };
  if (!su?.applicantId) return { kind: "none" };
  const a = await db.applicant.findUnique({ where: { id: su.applicantId }, select: { id: true, email: true, name: true } });
  return a && sameEmail(a.email, su.loginEmail) ? { kind: "applicant", applicant: a } : { kind: "none" };
}
