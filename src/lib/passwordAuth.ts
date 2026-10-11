import type { Applicant, PrismaClient, User } from "@prisma/client";
import { dummyHash, verifyPassword } from "./password";

export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;

type Db = Pick<PrismaClient, "user" | "applicant">;

export type PasswordIdentity = { kind: "user"; user: User } | { kind: "applicant"; applicant: Applicant };

/** Lockout state shared by User and Applicant rows. */
type Lockable = { id: string; passwordHash: string | null; failedLogins: number; lockedUntil: Date | null };
type LockStore = { update(args: { where: { id: string }; data: { failedLogins: number; lockedUntil: Date | null } }): Promise<unknown> };

/**
 * Email + password sign-in for members and applicants. Looks up the User first; only when no User has that email,
 * the Applicant. Returns null for every failure (unknown email, no password, wrong password, locked, inactive) so the
 * sign-in page cannot tell them apart. LOCK_AFTER wrong passwords in a row lock whichever row matched for
 * LOCK_MINUTES; a success resets the count.
 */
export async function authenticateWithPassword(db: Db, rawEmail: string, password: string, now: Date = new Date()): Promise<PasswordIdentity | null> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return refuse(password);

  const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  if (user) {
    if (!(await checkPassword(db.user, user, password, now))) return null;
    return user.active ? { kind: "user", user } : null;
  }

  const applicant = await db.applicant.findUnique({ where: { email } });
  if (!applicant) return refuse(password); // unknown email: same hashing work as a known one (no enumeration)
  return (await checkPassword(db.applicant, applicant, password, now)) ? { kind: "applicant", applicant } : null;
}

/** Same work as a real check, so an unknown email takes as long as a known one. */
async function refuse(password: string): Promise<null> {
  await verifyPassword(password, await dummyHash());
  return null;
}

async function checkPassword(store: LockStore, row: Lockable, password: string, now: Date): Promise<boolean> {
  if (!row.passwordHash) {
    await refuse(password);
    return false;
  }
  if (row.lockedUntil && row.lockedUntil > now) return false;

  if (!(await verifyPassword(password, row.passwordHash))) {
    const failed = (row.lockedUntil ? 0 : row.failedLogins) + 1;
    await store.update({
      where: { id: row.id },
      data: failed >= LOCK_AFTER
        ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) }
        : { failedLogins: failed, lockedUntil: null },
    });
    return false;
  }

  if (row.failedLogins || row.lockedUntil) await store.update({ where: { id: row.id }, data: { failedLogins: 0, lockedUntil: null } });
  return true;
}
