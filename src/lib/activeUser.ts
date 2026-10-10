import { cache } from "react";
import { loadActiveUser, type ActiveUserLoader } from "./session-core";

const loadOnce = cache((id: string, loginEmail: string | null, pwv: number | null, db: Parameters<ActiveUserLoader>[0]) =>
  loadActiveUser(db, id, undefined, { loginEmail, pwv: pwv ?? undefined }));

/**
 * `loadActiveUser` memoised per request by React `cache()`: the Auth.js jwt callback and `requireUserWith` read the
 * same row for the same claims, so one request makes one User lookup instead of two. Outside a React render (where
 * `cache` does not memoise) it simply loads every time.
 */
export const loadActiveUserOnce: ActiveUserLoader = (db, id, claim) => loadOnce(id, claim.loginEmail ?? null, claim.pwv ?? null, db);
