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
