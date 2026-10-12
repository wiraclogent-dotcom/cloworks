import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma, scopedDb, type ScopedDb } from "./db";
import {
  isUnauthenticated, loadSessionApplicant, PasswordChangeRequiredError, requireUserWith, type SessionApplicant, type SessionUser,
} from "./session-core";
import { loadActiveUserOnce } from "./activeUser";
import { ENTER_PATH } from "./auth.config";

/**
 * Current user without the password-change check, for the /change-password flow itself. Memoised per request.
 * Throws when unauthenticated.
 */
export const requireUserForPasswordChange: () => Promise<SessionUser> = cache(() => requireUserWith(() => auth(), prisma, loadActiveUserOnce));

/**
 * Authoritative current user. Memoised per request by React `cache()` (the layout shell and the page share one lookup);
 * the cache never outlives a request. Throws when unauthenticated, or `PasswordChangeRequiredError` (an
 * UnauthenticatedError) while a password change is pending: server actions convert that via `withUser`.
 */
export const requireUser: () => Promise<SessionUser> = cache(async () => {
  const user = await requireUserForPasswordChange();
  if (user.mustChangePassword) throw new PasswordChangeRequiredError();
  return user;
});

/** For pages, layouts and server components: a revoked or stale session goes to sign-in, a pending password change to /change-password. */
export async function requireUserOrRedirect(): Promise<SessionUser> {
  let user: SessionUser;
  try {
    user = await requireUser();
  } catch (e) {
    if (e instanceof PasswordChangeRequiredError) redirect("/change-password");
    if (!isUnauthenticated(e)) throw e;
    redirect("/signin"); // outside the catch-all: redirect() works by throwing
  }
  return user;
}

export type { ScopedDb, SessionApplicant };

/**
 * For applicant-only pages (/lobby, /verify). Memoised per request. A member session (including an applicant whose
 * token was just upgraded after approval) goes through /lobby/enter, which writes the upgraded cookie and continues to
 * /requests; no or invalid session goes to /signin.
 */
export const requireApplicantOrRedirect: () => Promise<SessionApplicant> = cache(async () => {
  const r = await loadSessionApplicant(prisma, await auth());
  if (r.kind === "member") redirect(ENTER_PATH);
  if (r.kind === "none") redirect("/signin");
  return r.applicant;
});

/**
 * Who is visiting a public join page, without redirecting: a member, a valid applicant, or nobody (no session, or an
 * applicant session whose row is gone). Memoised per request.
 */
export const currentVisitor: () => Promise<
  { kind: "member" } | { kind: "none" } | { kind: "applicant"; applicant: SessionApplicant }
> = cache(async () => loadSessionApplicant(prisma, await auth()));

/** Database client scoped to the user's workspace. */
export const dbFor = (user: SessionUser): ScopedDb => scopedDb(user.workspaceId);

/** Current user plus their workspace-scoped db, memoised per request. Redirects like `requireUserOrRedirect`. */
export const requireScope: () => Promise<{ user: SessionUser; db: ScopedDb }> = cache(async () => {
  const user = await requireUserOrRedirect();
  return { user, db: dbFor(user) };
});
