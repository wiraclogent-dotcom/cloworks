import { encode } from "@auth/core/jwt";
import type { AppRole, JobRole } from "@prisma/client";

/** Pure helpers for scripts/dev-session.ts (LOCAL manual QA only). */

type Env = Record<string, string | undefined>;
export type DevSessionUser = { id: string; name: string | null; email: string | null; appRole: AppRole; jobRole: JobRole };

export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;
const PLACEHOLDER_SECRET_PREFIX = "change-me";
export const MIN_SECRET_LENGTH = 16;

export const normalizeEmail = (s: string): string => s.trim().toLowerCase();

/** True only for http(s) URLs whose host is exactly localhost, 127.0.0.1 or [::1]. */
export function isLocalHostUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  } catch {
    return false;
  }
}

/** True only for a postgres(ql):// URL whose host is exactly localhost, 127.0.0.1 or [::1] (no `host=` override). Never echoes the URL. */
export function isLocalDatabaseUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return false;
    const override = u.searchParams.get("host");
    if (override !== null && override !== "") return false;
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  } catch {
    return false;
  }
}

/** Refuses (throws) unless DATABASE_URL points at this machine. The message never contains the URL. */
export function assertLocalDatabase(env: Env): void {
  if (!isLocalDatabaseUrl(env.DATABASE_URL))
    throw new Error("Refusing to run: DATABASE_URL must point at localhost, 127.0.0.1 or [::1] (this tool never touches a remote database).");
}

/** Auth.js v5 session cookie name (also the JWT salt): the `__Secure-` prefix applies on https. */
export function sessionCookieName(baseUrl: string): string {
  return new URL(baseUrl).protocol === "https:" ? "__Secure-authjs.session-token" : "authjs.session-token";
}

/** Refuses (throws) unless this is a local, non-production setup with a real secret. Never echoes the secret. */
export function assertDevSessionAllowed(env: Env): { secret: string; baseUrl: string } {
  if (env.NODE_ENV === "production") throw new Error("Refusing to run: NODE_ENV is production.");
  const urls = [env.AUTH_URL, env.APP_BASE_URL].map((v) => v?.trim()).filter((v): v is string => !!v);
  if (urls.length === 0) throw new Error("Refusing to run: set AUTH_URL (or APP_BASE_URL) to a localhost URL.");
  if (!urls.every(isLocalHostUrl)) throw new Error("Refusing to run: AUTH_URL / APP_BASE_URL must point at localhost, 127.0.0.1 or [::1].");
  const secret = env.AUTH_SECRET?.trim();
  if (!secret || secret.startsWith(PLACEHOLDER_SECRET_PREFIX) || secret.length < MIN_SECRET_LENGTH)
    throw new Error(`Refusing to run: AUTH_SECRET is missing, still the placeholder from .env.example, or shorter than ${MIN_SECRET_LENGTH} characters.`);
  return { secret, baseUrl: env.AUTH_URL?.trim() || env.APP_BASE_URL!.trim() };
}

/** Same claims src/lib/auth.ts leaves on a freshly signed-in token (see bindSignInToken in session-core.ts). */
export function buildSessionClaims(user: DevSessionUser) {
  const email = user.email ? normalizeEmail(user.email) : null;
  if (!email) throw new Error("User has no login email; cannot mint a session.");
  return {
    sub: user.id,
    uid: user.id,
    name: user.name,
    email,
    picture: null,
    appRole: user.appRole,
    jobRole: user.jobRole,
    loginEmail: email,
  };
}

/** Auth.js session JWT (JWE) valid for 24h, salted with the cookie name like Auth.js does. */
export function mintSessionToken(user: DevSessionUser, secret: string, cookieName: string): Promise<string> {
  return encode({ token: buildSessionClaims(user), secret, salt: cookieName, maxAge: SESSION_MAX_AGE_SECONDS });
}
