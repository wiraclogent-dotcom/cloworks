import type { AppRole, JobRole, Prisma, PrismaClient } from "@prisma/client";
import type { ScopedDb } from "./db";
import type { AdminError } from "./admin";

export type LinkablePerson = { id: string; name: string; fullName: string; appRole: AppRole; jobRole: JobRole; active: boolean };

/** Roster people without a login email (active or not), by name. Pass a workspace-scoped client. */
export async function listLinkablePeople(db: PrismaClient | ScopedDb): Promise<LinkablePerson[]> {
  return db.user.findMany({
    where: { email: null },
    select: { id: true, name: true, fullName: true, appRole: true, jobRole: true, active: true },
    orderBy: { name: "asc" },
  });
}

/** The person to attach a login to: in the workspace and without an email. Throws `stale()` otherwise. */
export async function assertLinkable(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  userId: string,
  stale: () => AdminError,
): Promise<{ id: string; name: string }> {
  const person = await tx.user.findFirst({ where: { id: userId, workspaceId, email: null }, select: { id: true, name: true } });
  if (!person) throw stale();
  return person;
}

/** Gives the person a login: email, password hash (null for Google-style), roles; active, sessions invalidated, lockout cleared. */
export async function attachLogin(
  tx: Prisma.TransactionClient,
  userId: string,
  login: { email: string; passwordHash: string | null; appRole: AppRole; jobRole: JobRole },
): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: {
      email: login.email,
      passwordHash: login.passwordHash,
      appRole: login.appRole,
      jobRole: login.jobRole,
      active: true,
      passwordVersion: { increment: 1 },
      failedLogins: 0,
      lockedUntil: null,
    },
  });
}
