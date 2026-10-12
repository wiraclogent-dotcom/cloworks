import {
  AppRole as AppRoleEnum, JobRole as JobRoleEnum, type AppRole, type JobRole, type JoinSource, type Prisma, type PrismaClient,
} from "@prisma/client";
import { AdminError, isUniqueViolation, lockRoster, type Actor } from "./admin";
import { can } from "./permissions";
import type { Mailer } from "./mailer";
import { approvedEmail } from "./joinEmails";
import { newJoinCode } from "./joinTokens";
import { pickShortName } from "./shortName";
import { JOIN_REQUEST_NOTIFICATION } from "./notificationLinks";
import { renderEmail } from "./emailLayout";
import { bestEffort, cleanLine, safeBaseUrl } from "./notify";

/**
 * Admin side of join requests. Takes the raw client because `Applicant` is global; every query is confined to
 * `requestedWorkspaceId = actor.workspaceId`, so another workspace's applicant is simply NOT_FOUND.
 */

export type JoinRequestRow = {
  applicantId: string;
  name: string;
  email: string;
  source: JoinSource;
  requestedAt: Date;
  rejectedAt: Date | null;
};

function assertAdmin(actor: Actor) {
  if (!actor || !can(actor.appRole, "admin.manage")) throw new AdminError("FORBIDDEN", "Only admins can do this");
}

const notFound = () => new AdminError("NOT_FOUND", "Join request not found");

export async function listJoinRequests(
  db: PrismaClient,
  actor: Actor,
): Promise<{ pending: JoinRequestRow[]; rejected: JoinRequestRow[] }> {
  assertAdmin(actor);
  const rows = await db.applicant.findMany({
    where: {
      requestedWorkspaceId: actor.workspaceId,
      emailVerifiedAt: { not: null },
      requestedAt: { not: null },
      requestSource: { not: null },
    },
    orderBy: [{ requestedAt: "desc" }, { id: "asc" }],
    select: { id: true, name: true, email: true, requestSource: true, requestedAt: true, rejectedAt: true },
  });
  const out = rows.map(
    (r): JoinRequestRow => ({
      applicantId: r.id,
      name: r.name,
      email: r.email,
      source: r.requestSource!,
      requestedAt: r.requestedAt!,
      rejectedAt: r.rejectedAt,
    }),
  );
  return { pending: out.filter((r) => !r.rejectedAt), rejected: out.filter((r) => r.rejectedAt) };
}

/**
 * Turns a pending, verified applicant of the actor's workspace into a User with the same id. The guarded
 * deleteMany is the race guard: of two parallel approvals only one deletes the row; the other gets NOT_FOUND.
 * An email that already belongs to any User rolls everything back (CONFLICT; the applicant is kept). Any open invite
 * for the email in this workspace is marked accepted in the same transaction.
 */
export async function approveApplicant(
  db: PrismaClient,
  actor: Actor,
  mailer: Mailer,
  applicantId: string,
  roles: { appRole: AppRole; jobRole: JobRole },
  baseUrl: string,
): Promise<{ userId: string }> {
  assertAdmin(actor);
  if (!Object.values(AppRoleEnum).includes(roles?.appRole)) throw new AdminError("VALIDATION", "Unknown app role");
  if (!Object.values(JobRoleEnum).includes(roles?.jobRole)) throw new AdminError("VALIDATION", "Unknown job role");

  let user: { id: string; email: string };
  try {
    user = await db.$transaction(async (tx) => {
      await lockRoster(tx);
      const guard = {
        id: applicantId,
        requestedWorkspaceId: actor.workspaceId,
        rejectedAt: null,
        emailVerifiedAt: { not: null },
      } satisfies Prisma.ApplicantWhereInput;
      const a = await tx.applicant.findFirst({ where: guard, select: { name: true, email: true, passwordHash: true } });
      if (!a) throw notFound();
      const del = await tx.applicant.deleteMany({ where: guard });
      if (del.count !== 1) throw notFound();
      const clash = await tx.user.findFirst({ where: { email: { equals: a.email, mode: "insensitive" } }, select: { id: true } });
      if (clash) throw new AdminError("CONFLICT", `${a.email} already has an account`);
      // An open invite for this email is answered by the approval: close it so it no longer shows as Invited.
      await tx.invite.updateMany({
        where: { workspaceId: actor.workspaceId, email: { equals: a.email, mode: "insensitive" }, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      const name = await pickShortName(tx, actor.workspaceId, a.name, a.email);
      const u = await tx.user.create({
        data: {
          id: applicantId,
          email: a.email,
          name,
          fullName: a.name,
          aliases: [],
          passwordHash: a.passwordHash,
          passwordVersion: 0,
          appRole: roles.appRole,
          jobRole: roles.jobRole,
          workspaceId: actor.workspaceId,
        },
        select: { id: true },
      });
      return { id: u.id, email: a.email };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AdminError("CONFLICT", "This person already has an account");
    throw e;
  }

  await bestEffort(async () => {
    const ws = await db.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId }, select: { name: true } });
    const mail = approvedEmail({ workspace: ws.name, url: baseUrl ? `${baseUrl}/signin` : "" });
    await mailer.send({ to: user.email, ...mail });
  });
  return { userId: user.id };
}

export async function rejectApplicant(db: PrismaClient, actor: Actor, applicantId: string): Promise<void> {
  assertAdmin(actor);
  const res = await db.applicant.updateMany({
    where: { id: applicantId, requestedWorkspaceId: actor.workspaceId, emailVerifiedAt: { not: null }, rejectedAt: null },
    data: { rejectedAt: new Date() },
  });
  if (res.count !== 1) throw notFound();
}

export async function undoReject(db: PrismaClient, actor: Actor, applicantId: string): Promise<void> {
  assertAdmin(actor);
  const res = await db.applicant.updateMany({
    where: { id: applicantId, requestedWorkspaceId: actor.workspaceId, emailVerifiedAt: { not: null }, rejectedAt: { not: null } },
    data: { rejectedAt: null },
  });
  if (res.count !== 1) throw notFound();
}

/** New join code for the actor's workspace; the old link stops working at once. */
export async function resetJoinLink(db: PrismaClient, actor: Actor): Promise<string> {
  assertAdmin(actor);
  const joinCode = newJoinCode();
  await db.workspace.update({ where: { id: actor.workspaceId }, data: { joinCode } });
  return joinCode;
}

export async function setJoinLinkEnabled(db: PrismaClient, actor: Actor, enabled: boolean): Promise<void> {
  assertAdmin(actor);
  await db.workspace.update({ where: { id: actor.workspaceId }, data: { joinLinkEnabled: enabled === true } });
}

/**
 * Tells every active admin of the applicant's requested workspace (bell + email). Best-effort per recipient: a
 * failed write or send is logged and skipped. The email links to Members → Requests under `baseUrl` (default:
 * APP_BASE_URL, like the other notifications); no valid base, no link.
 */
export async function notifyJoinRequest(db: PrismaClient, mailer: Mailer, applicantId: string, baseUrl?: string): Promise<void> {
  const a = await db.applicant.findUnique({
    where: { id: applicantId },
    select: { name: true, email: true, requestedWorkspace: { select: { id: true, name: true } } },
  });
  const ws = a?.requestedWorkspace;
  if (!a || !ws) return;
  const admins = await db.user.findMany({
    where: { workspaceId: ws.id, appRole: "ADMIN", active: true },
    select: { id: true, email: true },
  });
  const who = cleanLine(a.name, 80);
  const message = cleanLine(`${who} (${cleanLine(a.email, 254)}) asked to join`, 500);
  const wsName = cleanLine(ws.name, 120);
  const subject = cleanLine(`${who} asked to join ${ws.name}`, 200);
  const base = safeBaseUrl(baseUrl ?? process.env.APP_BASE_URL);
  const mail = renderEmail(
    {
      preheader: `${who} asked to join ${wsName}`,
      heading: "New request to join",
      lines: [`${who} (${cleanLine(a.email, 254)}) asked to join ${wsName}.`],
      button: base ? { label: "Review request", url: `${base}/admin/users?tab=requests` } : undefined,
    },
    { baseUrl: base ?? undefined },
  );
  await Promise.all(
    admins.map((u) =>
      bestEffort(async () => {
        const n = await db.notification.create({
          data: { userId: u.id, requestId: null, type: JOIN_REQUEST_NOTIFICATION, message, workspaceId: ws.id },
        });
        if (!u.email) return;
        await mailer.send({ to: u.email, subject, ...mail });
        await db.notification.update({ where: { id: n.id }, data: { emailedAt: new Date() } });
      }),
    ),
  );
}
