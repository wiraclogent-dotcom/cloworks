import { auth } from "./auth";
import { prisma } from "./db";
import { requireUserWith, type SessionUser } from "./session-core";

/** Use in server actions and route handlers instead of trusting session.user.appRole. */
export function requireUser(): Promise<SessionUser> {
  return requireUserWith(() => auth(), prisma);
}
