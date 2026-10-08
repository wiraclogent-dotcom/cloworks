import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./db";
import { isUnauthenticated, requireUserWith, type SessionUser } from "./session-core";

/**
 * Authoritative current user. Memoised per request by React `cache()` (the layout shell and the page share one lookup);
 * the cache never outlives a request. Throws when unauthenticated: server actions convert that via `withUser`.
 */
export const requireUser: () => Promise<SessionUser> = cache(() => requireUserWith(() => auth(), prisma));

/** For pages, layouts and server components: a revoked or stale session goes to sign-in instead of crashing. */
export async function requireUserOrRedirect(): Promise<SessionUser> {
  let user: SessionUser;
  try {
    user = await requireUser();
  } catch (e) {
    if (!isUnauthenticated(e)) throw e;
    redirect("/signin"); // outside the catch-all: redirect() works by throwing
  }
  return user;
}
