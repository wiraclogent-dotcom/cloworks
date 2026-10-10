import type { PrismaClient, User } from "@prisma/client";
import { dummyHash, verifyPassword } from "./password";
import { DEFAULT_ALLOWED_DOMAIN, isAllowedEmail } from "./signin";

export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;

type Db = Pick<PrismaClient, "user" | "allowedEmail">;

/**
 * Email + password sign-in. Returns the user, or null for every failure (unknown email, no password, wrong
 * password, locked, inactive, email no longer permitted) so the sign-in page cannot tell them apart.
 * LOCK_AFTER wrong passwords in a row lock the account for LOCK_MINUTES; a success resets the count.
 */
export async function authenticateWithPassword(db: Db, rawEmail: string, password: string, now: Date = new Date()): Promise<User | null> {
  const email = rawEmail.trim().toLowerCase();
  const user = email ? await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } }) : null;
  if (!user?.passwordHash) {
    await verifyPassword(password, await dummyHash());
    return null;
  }
  if (user.lockedUntil && user.lockedUntil > now) return null;

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = (user.lockedUntil ? 0 : user.failedLogins) + 1;
    await db.user.update({
      where: { id: user.id },
      data: failed >= LOCK_AFTER
        ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) }
        : { failedLogins: failed, lockedUntil: null },
    });
    return null;
  }

  if (user.failedLogins || user.lockedUntil) await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  if (!user.active) return null;
  const domain = process.env.ALLOWED_EMAIL_DOMAIN || DEFAULT_ALLOWED_DOMAIN;
  if (!isAllowedEmail(email, domain, [])) {
    const row = await db.allowedEmail.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
    if (!row) return null;
  }
  return user;
}
