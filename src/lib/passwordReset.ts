import type { PrismaClient } from "@prisma/client";
import { JoinError } from "./applicants";
import { resetEmail } from "./joinEmails";
import { hashToken, newToken } from "./joinTokens";
import type { Mailer } from "./mailer";
import { bestEffort } from "./notify";
import { checkNewPassword, hashPassword } from "./password";

export const RESET_TTL_MS = 60 * 60_000;
export const RESET_GAP_MS = 60_000;

type Db = PrismaClient;
type Deps = { db: Db; mailer: Mailer; baseUrl: string; now?: Date };

const normalizeEmail = (raw: string) => (raw ?? "").trim().toLowerCase();

/**
 * Emails a one-hour reset link when the address belongs to an active member or to an applicant. Returns nothing either
 * way, so the caller shows the same screen for every address. At most one link per address per minute; a new request
 * replaces the unused link.
 */
export async function requestPasswordReset(d: Deps, rawEmail: string): Promise<void> {
  const now = d.now ?? new Date();
  const email = normalizeEmail(rawEmail);
  if (!email.includes("@")) return;
  const [user, applicant] = await Promise.all([
    d.db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { active: true } }),
    d.db.applicant.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (!(user?.active || applicant)) return;
  const last = await d.db.passwordReset.findFirst({ where: { email }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (last && now.getTime() - last.createdAt.getTime() < RESET_GAP_MS) return;

  const token = newToken();
  await d.db.$transaction([
    d.db.passwordReset.deleteMany({ where: { email, usedAt: null } }),
    d.db.passwordReset.create({ data: { email, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) } }),
  ]);
  const url = d.baseUrl ? `${d.baseUrl}/reset/${token}` : "";
  await bestEffort(() => d.mailer.send({ to: email, ...resetEmail({ url }) }));
}

/** Whether a raw token from a reset link is still usable (exists, unused, not expired). */
export async function isResetLinkUsable(db: Db, token: string, now: Date = new Date()): Promise<boolean> {
  if (!token) return false;
  const row = await db.passwordReset.findUnique({ where: { tokenHash: hashToken(token) }, select: { usedAt: true, expiresAt: true } });
  return !!row && !row.usedAt && row.expiresAt > now;
}

/**
 * Sets a new password for the account the reset link was sent to, then consumes the link. Changing the password bumps
 * passwordVersion (ends every older session) and clears any lockout. A verified or unverified applicant is verified by
 * the link, since only the owner of the mailbox can open it. Throws JoinError("VALIDATION") before touching the link
 * when the password is too weak, and JoinError("LINK_INVALID") for a missing, used, expired or no-longer-valid link.
 */
export async function resetPassword(d: { db: Db; now?: Date }, token: string, password: string): Promise<void> {
  const now = d.now ?? new Date();
  const problem = checkNewPassword(password);
  if (problem) throw new JoinError("VALIDATION", problem);
  const invalid = () => new JoinError("LINK_INVALID", "This link has expired or was already used. Ask for a new one.");
  if (!token) throw invalid();

  const hash = await hashPassword(password);
  await d.db.$transaction(async (tx) => {
    const row = await tx.passwordReset.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, email: true, usedAt: true, expiresAt: true } });
    if (!row || row.usedAt || row.expiresAt <= now) throw invalid();
    const claimed = await tx.passwordReset.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) throw invalid();

    const user = await tx.user.findFirst({ where: { email: { equals: row.email, mode: "insensitive" } } });
    if (user) {
      if (!user.active) throw invalid();
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: hash, passwordVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null, mustChangePassword: false },
      });
      return;
    }
    const applicant = await tx.applicant.findUnique({ where: { email: row.email } });
    if (!applicant) throw invalid();
    await tx.applicant.update({
      where: { id: applicant.id },
      data: { passwordHash: hash, failedLogins: 0, lockedUntil: null, emailVerifiedAt: applicant.emailVerifiedAt ?? now },
    });
  });
}
