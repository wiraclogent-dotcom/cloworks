import type { PrismaClient, RequestStatus } from "@prisma/client";
import type { SessionUser } from "./session-core";
import { transitionRequestWith, TransitionError, type TransitionOpts } from "./transition";
import { can } from "./permissions";

/** Testable core of the server action: identity via injected getUser, then authorize, then transition. */
export async function runTransitionAction(
  getUser: () => Promise<SessionUser>,
  db: PrismaClient,
  requestId: string,
  to: RequestStatus,
  opts?: TransitionOpts,
): Promise<void> {
  const user = await getUser();
  if (!can(user.appRole, "request.transition")) throw new TransitionError("FORBIDDEN", "Forbidden: not allowed to change request status");
  await transitionRequestWith(db, user, requestId, to, opts);
}

export type MoveResult =
  | { ok: true }
  | { ok: false; code: "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "UNAUTHENTICATED" | "ERROR"; message: string };

/** Like runTransitionAction but expected failures come back as data (Next redacts thrown errors in production). */
export async function moveRequestWith(
  getUser: () => Promise<SessionUser>,
  db: PrismaClient,
  requestId: string,
  to: RequestStatus,
  opts?: TransitionOpts,
): Promise<MoveResult> {
  try {
    await runTransitionAction(getUser, db, requestId, to, opts);
    return { ok: true };
  } catch (e) {
    if (e instanceof TransitionError) return { ok: false, code: e.code, message: e.message };
    if (e instanceof Error && e.message === "Unauthenticated") return { ok: false, code: "UNAUTHENTICATED", message: "Your session has expired. Sign in again." };
    console.error("moveRequest failed", e);
    return { ok: false, code: "ERROR", message: "Something went wrong. Please try again." };
  }
}
