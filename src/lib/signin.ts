import type { PrismaClient, User } from "@prisma/client";

export const DEFAULT_ALLOWED_DOMAIN = "clogent.co.id";

/** Pure: exact (case-insensitive) domain match, or the full address is on the allow-list. */
export function isAllowedEmail(email: string, domain: string, allowList: string[]): boolean {
  const e = email.trim().toLowerCase();
  const parts = e.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  if (parts[1] === domain.trim().toLowerCase()) return true;
  return allowList.some((a) => a.trim().toLowerCase() === e);
}

export type SignInResult =
  | { ok: true; user: User; created: boolean }
  | { ok: false; reason: "no-email" | "not-allowed" | "inactive" | "untrusted" };

type Db = Pick<PrismaClient, "user" | "allowedEmail">;
type Env = Record<string, string | undefined>;

/** Pure: is the identity provider's email claim trustworthy? Fails closed. */
export function isTrustedIdentity(
  provider: string | undefined,
  profile: { email_verified?: unknown; tid?: unknown },
  env: Env,
): boolean {
  if (provider === "google") return profile.email_verified === true;
  if (provider === "microsoft-entra-id") {
    const tenant = env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID?.trim();
    return !!tenant && profile.tid === tenant;
  }
  return false;
}

/** Full sign-in decision: trusted identity, then permitted email, then link-by-email or create. */
export async function decideSignIn(
  db: Db,
  provider: string | undefined,
  profile: { email?: string | null; name?: string | null; email_verified?: unknown; tid?: unknown },
  env: Env,
): Promise<SignInResult> {
  if (!isTrustedIdentity(provider, profile, env)) return { ok: false, reason: "untrusted" };
  return resolveSignIn(db, profile, env.ALLOWED_EMAIL_DOMAIN || DEFAULT_ALLOWED_DOMAIN, {
    viaAllowList: provider !== "microsoft-entra-id",
  });
}

/**
 * Permitted email (domain, or allow-list when viaAllowList), active user.
 * First-login linking is by exact normalized User.email only; otherwise create a REQUESTER.
 * No alias/name matching (privilege-escalation risk).
 */
export async function resolveSignIn(
  db: Db,
  profile: { email?: string | null; name?: string | null },
  domain: string = DEFAULT_ALLOWED_DOMAIN,
  opts: { viaAllowList?: boolean } = {},
): Promise<SignInResult> {
  const email = profile.email?.trim().toLowerCase();
  if (!email) return { ok: false, reason: "no-email" };

  const allowList =
    opts.viaAllowList === false
      ? []
      : (await db.allowedEmail.findMany({ select: { email: true } })).map((a) => a.email);
  if (!isAllowedEmail(email, domain, allowList)) return { ok: false, reason: "not-allowed" };

  const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (user) {
    return user.active ? { ok: true, user, created: false } : { ok: false, reason: "inactive" };
  }

  const local = email.split("@")[0];
  const display = profile.name?.trim() || local;
  const created = await db.user.create({ data: { email, name: display, fullName: display, appRole: "REQUESTER" } });
  return { ok: true, user: created, created: true };
}
