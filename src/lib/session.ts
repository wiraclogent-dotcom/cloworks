import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma, scopedDb, type ScopedDb } from "./db";
import { isUnauthenticated, PasswordChangeRequiredError, requireUserWith, type SessionUser } from "./session-core";

/**
 * Current user without the password-change check, for the /change-password flow itself. Memoised per request.
 * Throws when unauthenticated.
 */
export const requireUserForPasswordChange: () => Promise<SessionUser> = cache(() => requireUserWith(() => auth(), prisma));

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

/** Database client scoped to the user's workspace. */
export const dbFor = (user: SessionUser): ScopedDb => scopedDb(user.workspaceId);

/** Current user plus their workspace-scoped db, memoised per request. Redirects like `requireUserOrRedirect`. */
export const requireScope: () => Promise<{ user: SessionUser; db: ScopedDb }> = cache(async () => {
  const user = await requireUserOrRedirect();
  return { user, db: dbFor(user) };
});
