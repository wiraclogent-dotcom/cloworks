import { AppRole as AppRoleEnum, JobRole as JobRoleEnum, type AppRole, type Invite, type JobRole, type PrismaClient } from "@prisma/client";
import type { ScopedDb } from "./db";
import type { Mailer } from "./mailer";
import { AdminError, assertAdmin, isUniqueViolation, lockRoster, normalizeEmail, type Actor } from "./admin";
import { assertLinkable, attachLogin } from "./linkPerson";
import { INVITE_TTL_MS, hashToken, maskEmail, newToken } from "./joinTokens";
import { inviteEmail } from "./joinEmails";
import { checkNewPassword, hashPassword } from "./password";
import { pickShortName } from "./shortName";
import { JOB_ROLE_LABEL, ROLE_LABEL } from "./settings/account";

const MAX_NAME_LEN = 100;

/** Shown when an invite's linked person got a login or was removed since the invite was sent. */
export const INVITE_STALE_MESSAGE = "This invite no longer matches a person. Ask your admin for a new one.";

function assertRoles(appRole: unknown, jobRole: unknown) {
  if (!Object.values(AppRoleEnum).includes(appRole as AppRole)) throw new AdminError("VALIDATION", `Unknown app role "${String(appRole)}"`);
  if (!Object.values(JobRoleEnum).includes(jobRole as JobRole)) throw new AdminError("VALIDATION", `Unknown job role "${String(jobRole)}"`);
}

const openWhere = { acceptedAt: null, revokedAt: null } as const;

/** "Designer", or the app role when the job role is Other. */
export const roleLabel = (inv: Pick<Invite, "appRole" | "jobRole">) => (inv.jobRole === "OTHER" ? ROLE_LABEL[inv.appRole] : JOB_ROLE_LABEL[inv.jobRole]);

/**
 * Gives the invite a fresh token and expiry (optionally new roles) and emails the link; the old link stops working.
 * The email goes out FIRST: if it fails (bad address, provider down) nothing is written, the current link and roles
 * keep working, and the admin gets VALIDATION naming the address.
 */
async function issue(db: ScopedDb, actor: Actor, mailer: Mailer, inviteId: string, baseUrl: string, roles?: { appRole: AppRole; jobRole: JobRole; userId?: string }) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [inv, inviter, workspace] = await Promise.all([
    db.invite.findUniqueOrThrow({ where: { id: inviteId }, select: { email: true, appRole: true, jobRole: true } }),
    db.user.findUnique({ where: { id: actor.id }, select: { fullName: true, name: true } }),
    db.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId }, select: { name: true } }),
  ]);
  const mail = inviteEmail({
    inviter: inviter?.fullName || inviter?.name || "Your admin",
    workspace: workspace.name,
    role: roleLabel(roles ?? inv),
    url: baseUrl ? `${baseUrl.replace(/\/+$/, "")}/join/invite/${token}` : "",
    expires: expiresAt,
  });
  try {
    await mailer.send({ to: inv.email, ...mail });
  } catch (e) {
    console.error("[invites] invite email failed", e);
    throw new AdminError("VALIDATION", `Couldn't email ${inv.email} — check the address.`);
  }
  await db.invite.update({
    where: { id: inviteId },
    data: { tokenHash: hashToken(token), expiresAt, invitedById: actor.id, ...roles },
  });
}

/**
 * Invites an email to the actor's workspace with the given roles and emails the link. Refuses an email that already
 * belongs to a member (active or deactivated); an existing open invite for the email is resent (new token, new roles)
 * instead of duplicated. A failed email throws VALIDATION and leaves no new invite (an existing one is unchanged).
 */
export async function createInvite(
  db: ScopedDb,
  actor: Actor,
  mailer: Mailer,
  input: { email: string; appRole: AppRole; jobRole: JobRole; userId?: string },
  baseUrl: string,
): Promise<{ id: string }> {
  assertAdmin(actor);
  const email = normalizeEmail(input.email);
  assertRoles(input.appRole, input.jobRole);
  const member = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { active: true } });
  if (member?.active) throw new AdminError("CONFLICT", `${email} is already a member`);
  if (member) throw new AdminError("CONFLICT", `${email} belongs to a deactivated member — reactivate them instead`);

  if (input.userId) {
    const person = await db.user.findFirst({ where: { id: input.userId, email: null }, select: { id: true } });
    if (!person) throw new AdminError("VALIDATION", "That person already has a login or no longer exists.");
  }
  const roles = { appRole: input.appRole, jobRole: input.jobRole, ...(input.userId ? { userId: input.userId } : {}) };
  const open = await db.invite.findFirst({ where: { email, ...openWhere }, select: { id: true } });
  if (open) {
    await issue(db, actor, mailer, open.id, baseUrl, roles);
    return { id: open.id };
  }
  // Placeholder hash and an already-past expiry (unusable); issue() sets both once the email has gone out.
  const { id } = await db.invite.create({
    data: { email, ...roles, tokenHash: hashToken(newToken()), invitedById: actor.id, expiresAt: new Date() },
    select: { id: true },
  });
  try {
    await issue(db, actor, mailer, id, baseUrl, roles);
  } catch (e) {
    // The email never went out: don't leave a dead invite listed under Invited.
    await db.invite.deleteMany({ where: { id, acceptedAt: null } });
    throw e;
  }
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
  /** Roster name of the person this invite attaches to, or null for a new member. */
  linkedName: string | null;
};

/** What the invite page shows for a raw token; null when no invite has that token. */
export async function describeInvite(db: PrismaClient, token: string, now: Date = new Date()): Promise<InviteView | null> {
  if (!token) return null;
  const inv = await db.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { workspace: { select: { name: true } }, user: { select: { name: true } }, invitedBy: { select: { fullName: true, name: true } } },
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
    linkedName: inv.user?.name ?? null,
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
): Promise<{ userId: string; email: string; linked: boolean }> {
  let passwordHash: string | null = null;
  if (!("applicantId" in who)) {
    const problem = checkNewPassword(who.password ?? "");
    if (problem) throw new AdminError("VALIDATION", problem);
    passwordHash = await hashPassword(who.password);
  }
  const gone = () => new AdminError("NOT_FOUND", "This invite has expired or was already used. Ask your admin for a new one.");
  const stale = () => new AdminError("NOT_FOUND", INVITE_STALE_MESSAGE);

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

      if (inv.userId) {
        // Linked invite: the login goes onto the existing roster person (typed name ignored, no new User).
        let hash = passwordHash;
        if ("applicantId" in who) {
          const ap = await tx.applicant.findUnique({ where: { id: who.applicantId } });
          if (!ap) throw gone();
          if (ap.email.toLowerCase() !== email) throw new AdminError("VALIDATION", `This invite is for ${maskEmail(email)}`);
          hash = ap.passwordHash;
        }
        await lockRoster(tx);
        await assertLinkable(tx, inv.workspaceId, inv.userId, stale);
        await tx.applicant.deleteMany({ where: { email } });
        await attachLogin(tx, inv.userId, { email, passwordHash: hash, appRole: inv.appRole, jobRole: inv.jobRole });
        return { userId: inv.userId, email, linked: true };
      }

      let id: string | undefined;
      let display: string;
      if ("applicantId" in who) {
        const ap = await tx.applicant.findUnique({ where: { id: who.applicantId } });
        if (!ap) throw gone();
        if (ap.email.toLowerCase() !== email) throw new AdminError("VALIDATION", `This invite is for ${maskEmail(email)}`);
        id = ap.id;
        display = ap.name.trim() || email.split("@")[0];
        passwordHash = ap.passwordHash;
      } else {
        display = (who.name ?? "").trim().replace(/\s+/g, " ");
        if (!display || display.length > MAX_NAME_LEN) throw new AdminError("VALIDATION", `Name must be 1 to ${MAX_NAME_LEN} characters`);
      }

      await tx.applicant.deleteMany({ where: { email } });
      // Serialise with other roster writes (approvals, accepts) so two people can't pick the same short name.
      await lockRoster(tx);
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
      return { userId: user.id, email, linked: false };
    });
  } catch (e) {
    // A User with this email (or id) appeared concurrently.
    if (isUniqueViolation(e)) throw new AdminError("CONFLICT", "This email already has an account. Sign in instead.");
    throw e;
  }
}
