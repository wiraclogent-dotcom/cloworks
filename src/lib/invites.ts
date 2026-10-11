import { Prisma, AppRole as AppRoleEnum, JobRole as JobRoleEnum, type AppRole, type Invite, type JobRole, type PrismaClient } from "@prisma/client";
import type { ScopedDb } from "./db";
import type { Mailer } from "./mailer";
import { AdminError, normalizeEmail, type Actor } from "./admin";
import { can } from "./permissions";
import { INVITE_TTL_MS, hashToken, maskEmail, newToken } from "./joinTokens";
import { inviteEmail } from "./joinEmails";
import { checkNewPassword, hashPassword } from "./password";
import { pickShortName } from "./shortName";
import { JOB_ROLE_LABEL, ROLE_LABEL } from "./settings/account";

const MAX_NAME_LEN = 100;

function assertAdmin(actor: Actor) {
  if (!actor || !can(actor.appRole, "admin.manage")) throw new AdminError("FORBIDDEN", "Only admins can do this");
}

function assertRoles(appRole: unknown, jobRole: unknown) {
  if (!Object.values(AppRoleEnum).includes(appRole as AppRole)) throw new AdminError("VALIDATION", `Unknown app role "${String(appRole)}"`);
  if (!Object.values(JobRoleEnum).includes(jobRole as JobRole)) throw new AdminError("VALIDATION", `Unknown job role "${String(jobRole)}"`);
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const openWhere = { acceptedAt: null, revokedAt: null } as const;

/** "Designer", or the app role when the job role is Other. */
export const roleLabel = (inv: Pick<Invite, "appRole" | "jobRole">) => (inv.jobRole === "OTHER" ? ROLE_LABEL[inv.appRole] : JOB_ROLE_LABEL[inv.jobRole]);

/** Gives the invite a fresh token and expiry (optionally new roles) and emails the link. The old link stops working. */
async function issue(db: ScopedDb, actor: Actor, mailer: Mailer, inviteId: string, baseUrl: string, roles?: { appRole: AppRole; jobRole: JobRole }) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const inv = await db.invite.update({
    where: { id: inviteId },
    data: { tokenHash: hashToken(token), expiresAt, invitedById: actor.id, ...roles },
  });
  const [inviter, workspace] = await Promise.all([
    db.user.findUnique({ where: { id: actor.id }, select: { fullName: true, name: true } }),
    db.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId }, select: { name: true } }),
  ]);
  const mail = inviteEmail({
    inviter: inviter?.fullName || inviter?.name || "Your admin",
    workspace: workspace.name,
    role: roleLabel(inv),
    url: `${baseUrl.replace(/\/+$/, "")}/join/invite/${token}`,
    expires: expiresAt,
  });
  await mailer.send({ to: inv.email, ...mail });
}

/**
 * Invites an email to the actor's workspace with the given roles and emails the link. Refuses an email that already
 * belongs to a member (active or deactivated); an existing open invite for the email is resent (new token, new roles)
 * instead of duplicated.
 */
export async function createInvite(
  db: ScopedDb,
  actor: Actor,
  mailer: Mailer,
  input: { email: string; appRole: AppRole; jobRole: JobRole },
  baseUrl: string,
): Promise<{ id: string }> {
  assertAdmin(actor);
  const email = normalizeEmail(input.email);
  assertRoles(input.appRole, input.jobRole);
  const member = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { active: true } });
  if (member?.active) throw new AdminError("CONFLICT", `${email} is already a member`);
  if (member) throw new AdminError("CONFLICT", `${email} belongs to a deactivated member — reactivate them instead`);

  const roles = { appRole: input.appRole, jobRole: input.jobRole };
  const open = await db.invite.findFirst({ where: { email, ...openWhere }, select: { id: true } });
  const id =
    open?.id ??
    (
      await db.invite.create({
        // Placeholder hash and expiry; issue() replaces both before the email goes out.
        data: { email, ...roles, tokenHash: hashToken(newToken()), invitedById: actor.id, expiresAt: new Date() },
        select: { id: true },
      })
    ).id;
  await issue(db, actor, mailer, id, baseUrl, roles);
  return { id };
}

/** New token and expiry for an open invite, emailed again. NOT_FOUND once accepted or revoked. */
export async function resendInvite(db: ScopedDb, actor: Actor, mailer: Mailer, inviteId: string, baseUrl: string): Promise<void> {
  assertAdmin(actor);
  const inv = await db.invite.findFirst({ where: { id: inviteId, ...openWhere }, select: { id: true } });
  if (!inv) throw new AdminError("NOT_FOUND", "Invite not found or no longer open");
  await issue(db, actor, mailer, inv.id, baseUrl);
}

/** Revokes an open invite; its link stops working at once. */
export async function revokeInvite(db: ScopedDb, actor: Actor, inviteId: string): Promise<void> {
  assertAdmin(actor);
  const { count } = await db.invite.updateMany({ where: { id: inviteId, ...openWhere }, data: { revokedAt: new Date() } });
  if (count === 0) throw new AdminError("NOT_FOUND", "Invite not found or no longer open");
}

export type InviteView = {
  status: "open" | "expired" | "used";
  workspaceName: string;
  inviterName: string;
  appRole: AppRole;
  jobRole: JobRole;
  maskedEmail: string;
  email: string;
};

/** What the invite page shows for a raw token; null when no invite has that token. */
export async function describeInvite(db: PrismaClient, token: string, now: Date = new Date()): Promise<InviteView | null> {
  if (!token) return null;
  const inv = await db.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { workspace: { select: { name: true } }, invitedBy: { select: { fullName: true, name: true } } },
  });
  if (!inv) return null;
  const status = inv.acceptedAt || inv.revokedAt ? "used" : inv.expiresAt <= now ? "expired" : "open";
  return {
    status,
    workspaceName: inv.workspace.name,
    inviterName: inv.invitedBy.fullName || inv.invitedBy.name,
    appRole: inv.appRole,
    jobRole: inv.jobRole,
    maskedEmail: maskEmail(inv.email),
    email: inv.email,
  };
}

/**
 * Accepts an open, unexpired invite and creates the member, in one transaction.
 *
 * - `{ applicantId }`: the caller's own applicant session. Its email must equal the invite email; the User reuses the
 *   applicant's id, name and password hash.
 * - `{ name, password }`: anonymous holder of the token (the token proves the inbox). Any applicant row for the email
 *   is deleted and the User gets a FRESH id — an unverified applicant's id may sit in a squatter's session, and
 *   reusing it would make that session a member.
 *
 * NOT_FOUND when the invite is unknown, accepted, revoked or expired (also for the loser of a concurrent accept).
 * FORBIDDEN when the email belongs to a deactivated User; CONFLICT when it already belongs to an active one.
 */
export async function acceptInvite(
  db: PrismaClient,
  token: string,
  who: { applicantId: string } | { name: string; password: string },
  now: Date = new Date(),
): Promise<{ userId: string; email: string }> {
  let fresh: { display: string; passwordHash: string } | null = null;
  if (!("applicantId" in who)) {
    const display = (who.name ?? "").trim().replace(/\s+/g, " ");
    if (!display || display.length > MAX_NAME_LEN) throw new AdminError("VALIDATION", `Name must be 1 to ${MAX_NAME_LEN} characters`);
    const problem = checkNewPassword(who.password ?? "");
    if (problem) throw new AdminError("VALIDATION", problem);
    fresh = { display, passwordHash: await hashPassword(who.password) };
  }
  const gone = () => new AdminError("NOT_FOUND", "This invite has expired or was already used. Ask your admin for a new one.");

  try {
    return await db.$transaction(async (tx) => {
      const inv = await tx.invite.findUnique({ where: { tokenHash: hashToken(token ?? "") } });
      if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= now) throw gone();
      const email = inv.email.toLowerCase();

      // Claim first: of two concurrent accepts only one sees count 1 (the other blocks on the row lock, re-checks and
      // gets NOT_FOUND). Any error below rolls the claim back.
      const claimed = await tx.invite.updateMany({
        where: { id: inv.id, ...openWhere, expiresAt: { gt: now } },
        data: { acceptedAt: now },
      });
      if (claimed.count === 0) throw gone();

      const existing = await tx.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { active: true } });
      if (existing && !existing.active)
        throw new AdminError("FORBIDDEN", "This email belongs to a deactivated account. Contact your admin.");
      if (existing) throw new AdminError("CONFLICT", "This email already has an account. Sign in instead.");

      let id: string | undefined;
      let display: string;
      let passwordHash: string | null;
      if ("applicantId" in who) {
        const ap = await tx.applicant.findUnique({ where: { id: who.applicantId } });
        if (!ap) throw gone();
        if (ap.email.toLowerCase() !== email) throw new AdminError("VALIDATION", `This invite is for ${maskEmail(email)}`);
        id = ap.id;
        display = ap.name.trim() || email.split("@")[0];
        passwordHash = ap.passwordHash;
      } else {
        display = fresh!.display;
        passwordHash = fresh!.passwordHash;
      }

      await tx.applicant.deleteMany({ where: { email } });
      const name = await pickShortName(tx, inv.workspaceId, display, email);
      const user = await tx.user.create({
        data: {
          ...(id ? { id } : {}),
          email,
          name,
          fullName: display,
          passwordHash,
          appRole: inv.appRole,
          jobRole: inv.jobRole,
          workspaceId: inv.workspaceId,
        },
        select: { id: true },
      });
      return { userId: user.id, email };
    });
  } catch (e) {
    // A User with this email (or id) appeared concurrently.
    if (isUniqueViolation(e)) throw new AdminError("CONFLICT", "This email already has an account. Sign in instead.");
    throw e;
  }
}
