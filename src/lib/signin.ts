import type { Applicant, PrismaClient, User } from "@prisma/client";
import { JoinError, oauthApplicant } from "./applicants";

/** OAuth sign-in decision: a member, an applicant (found or created), or refused. */
export type SignInResult =
  | { ok: true; kind: "user"; user: User }
  | { ok: true; kind: "applicant"; applicant: Applicant }
  | { ok: false; reason: "no-email" | "inactive" | "untrusted" | "refused" };

/** Who an email belongs to right now. Never creates anything. */
export type ResolveResult =
  | { ok: true; kind: "user"; user: User }
  | { ok: true; kind: "applicant"; applicant: Applicant }
  | { ok: false; reason: "no-email" | "inactive" | "not-found" };

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

/**
 * Full OAuth sign-in decision. Requires a trusted identity. An existing User (exact email, any case) signs in as a
 * member when active; any other email becomes a verified Applicant (found or created by `oauthApplicant`, which also
 * routes a workspace-domain email to that workspace's join requests). Nobody becomes a User here.
 */
export async function decideSignIn(
  db: PrismaClient,
  provider: string | undefined,
  profile: { email?: string | null; name?: string | null; email_verified?: unknown; tid?: unknown },
  env: Env,
): Promise<SignInResult> {
  if (!isTrustedIdentity(provider, profile, env)) return { ok: false, reason: "untrusted" };
  const email = profile.email?.trim().toLowerCase();
  if (!email) return { ok: false, reason: "no-email" };

  const user = await findUser(db, email);
  if (user) return user.active ? { ok: true, kind: "user", user } : { ok: false, reason: "inactive" };

  try {
    const applicant = await oauthApplicant({ db, baseUrl: env.APP_BASE_URL }, { email, name: profile.name ?? "" });
    return { ok: true, kind: "applicant", applicant };
  } catch (e) {
    if (!(e instanceof JoinError)) throw e;
    // INACTIVE_MEMBER: a deactivated User appeared meanwhile. Anything else (unusable email, or an active User /
    // changed row appeared meanwhile): refuse this attempt rather than guess.
    return { ok: false, reason: e.code === "INACTIVE_MEMBER" ? "inactive" : "refused" };
  }
}

/**
 * Who a just-vetted sign-in email belongs to (jwt callback): an active User first, else an Applicant. Matches the
 * exact email in any case; no alias/name matching (privilege-escalation risk). Creates nothing.
 */
export async function resolveSignIn(
  db: Pick<PrismaClient, "user" | "applicant">,
  profile: { email?: string | null; name?: string | null },
): Promise<ResolveResult> {
  const email = profile.email?.trim().toLowerCase();
  if (!email) return { ok: false, reason: "no-email" };

  const user = await findUser(db, email);
  if (user) return user.active ? { ok: true, kind: "user", user } : { ok: false, reason: "inactive" };

  const applicant = await db.applicant.findUnique({ where: { email } });
  return applicant ? { ok: true, kind: "applicant", applicant } : { ok: false, reason: "not-found" };
}

function findUser(db: Pick<PrismaClient, "user">, email: string) {
  return db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
}
