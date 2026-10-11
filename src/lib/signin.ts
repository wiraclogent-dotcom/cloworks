import type { PrismaClient, User } from "@prisma/client";
import { pickShortName } from "./shortName";

/** Pure: the domain of a well-formed address (exactly one @, both sides non-empty), lowercased; otherwise null. */
export function emailDomainOf(email: string): string | null {
  const parts = email.trim().toLowerCase().split("@");
  return parts.length === 2 && parts[0] && parts[1] ? parts[1] : null;
}

export type SignInResult =
  | { ok: true; user: User; created: boolean }
  | { ok: false; reason: "no-email" | "not-allowed" | "inactive" | "untrusted" };

type Db = Pick<PrismaClient, "user" | "workspace">;
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

/** Full sign-in decision: trusted identity, then link-by-email or (workspace email domain) create. */
export async function decideSignIn(
  db: Db,
  provider: string | undefined,
  profile: { email?: string | null; name?: string | null; email_verified?: unknown; tid?: unknown },
  env: Env,
): Promise<SignInResult> {
  if (!isTrustedIdentity(provider, profile, env)) return { ok: false, reason: "untrusted" };
  return resolveSignIn(db, profile);
}

/**
 * An existing User (matched by exact normalized email) signs in when active. An unknown email is created as a
 * REQUESTER only when its domain is some workspace's `emailDomain` (that workspace); anything else is "not-allowed".
 * No alias/name matching (privilege-escalation risk).
 */
export async function resolveSignIn(db: Db, profile: { email?: string | null; name?: string | null }): Promise<SignInResult> {
  const email = profile.email?.trim().toLowerCase();
  if (!email) return { ok: false, reason: "no-email" };

  const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (user) {
    return user.active ? { ok: true, user, created: false } : { ok: false, reason: "inactive" };
  }

  const domain = emailDomainOf(email);
  const workspace = domain
    ? await db.workspace.findFirst({ where: { emailDomain: { equals: domain, mode: "insensitive" } }, select: { id: true } })
    : null;
  if (!workspace) return { ok: false, reason: "not-allowed" };

  const local = email.split("@")[0];
  const display = profile.name?.trim() || local;
  // `name` is the short name used for @mentions, admin collision checks and import resolution. If the OAuth display name
  // collides with anyone's name/fullName/alias, fall back to the email local part (numeric suffix if that collides too).
  const workspaceId = workspace.id;
  const name = await pickShortName(db, workspaceId, display, email);
  const created = await db.user.create({ data: { workspaceId, email, name, fullName: display, appRole: "REQUESTER" } });
  return { ok: true, user: created, created: true };
}
