import { isUnauthenticated, type SessionUser } from "./session-core";

export const UNAUTH_MESSAGE = "Your session ended. Sign in again.";
export type UnauthResult = { ok: false; code: "UNAUTHENTICATED"; message: string };
export const unauthResult = (): UnauthResult => ({ ok: false, code: "UNAUTHENTICATED", message: UNAUTH_MESSAGE });

/**
 * Shared server-action guard. Resolves the user through `getUser`; an unauthenticated session returns a result
 * object (`onUnauth`, default `{ ok:false, code:"UNAUTHENTICATED", message }`) instead of throwing, because Next
 * redacts thrown errors in production. Errors from `fn` itself are NOT swallowed.
 */
export async function withUser<T, U = UnauthResult>(
  getUser: () => Promise<SessionUser>,
  fn: (user: SessionUser) => Promise<T>,
  onUnauth: () => U = unauthResult as unknown as () => U,
): Promise<T | U> {
  let user: SessionUser;
  try {
    user = await getUser();
  } catch (e) {
    if (isUnauthenticated(e)) return onUnauth();
    throw e;
  }
  return fn(user);
}
