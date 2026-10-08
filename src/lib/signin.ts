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
  | { ok: false; reason: "no-email" | "not-allowed" | "inactive" };

type Db = Pick<PrismaClient, "user" | "allowedEmail">;

/**
 * Sign-in decision: permitted email (domain or allow-list), active user,
 * link to an existing User (email, else unclaimed alias match on the email
 * local-part), else create a REQUESTER.
 */
export async function resolveSignIn(
  db: Db,
  profile: { email?: string | null; name?: string | null },
  domain: string = DEFAULT_ALLOWED_DOMAIN,
): Promise<SignInResult> {
  const email = profile.email?.trim().toLowerCase();
  if (!email) return { ok: false, reason: "no-email" };

  const allowList = (await db.allowedEmail.findMany({ select: { email: true } })).map((a) => a.email);
  if (!isAllowedEmail(email, domain, allowList)) return { ok: false, reason: "not-allowed" };

  let user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (user) {
    return user.active ? { ok: true, user, created: false } : { ok: false, reason: "inactive" };
  }

  // Safe alias link: only an unclaimed row (no email yet), active, exactly one match
  // on the email local-part against aliases or short name. Ambiguity => no link.
  const local = email.split("@")[0];
  const candidates = await db.user.findMany({
    where: {
      email: null,
      OR: [{ aliases: { has: local } }, { name: { equals: local, mode: "insensitive" } }],
    },
  });
  const lower = candidates.filter(
    (c) => c.name.toLowerCase() === local || c.aliases.some((a) => a.toLowerCase() === local),
  );
  if (lower.length === 1) {
    const [match] = lower;
    if (!match.active) return { ok: false, reason: "inactive" };
    user = await db.user.update({ where: { id: match.id }, data: { email } });
    return { ok: true, user, created: false };
  }

  const display = profile.name?.trim() || local;
  user = await db.user.create({ data: { email, name: display, fullName: display, appRole: "REQUESTER" } });
  return { ok: true, user, created: true };
}
