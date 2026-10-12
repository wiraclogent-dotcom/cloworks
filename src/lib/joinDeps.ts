import { headers } from "next/headers";
import { describeJoinCode, lobbyState, type Deps } from "./applicants";
import type { AppRole, JobRole } from "@prisma/client";
import type { Actor } from "./admin";
import { acceptInvite, describeInvite } from "./invites";
import type { Mailer } from "./mailer";
import { approveApplicant, listJoinRequests, rejectApplicant, resetJoinLink, setJoinLinkEnabled, undoReject } from "./joinRequests";
import { prisma } from "./db";
import { createMailerFromEnv } from "./mailer";
import { safeBaseUrl } from "./notify";
import { codeSecret } from "./joinTokens";
import { isResetLinkUsable, resetPassword } from "./passwordReset";

/**
 * Origin for links in emails: APP_BASE_URL when set. Outside production only, this request's origin (Host /
 * x-forwarded-host + x-forwarded-proto) as a dev convenience; in production those headers are attacker-controlled, so
 * without APP_BASE_URL the result is "" and emails go out without links. Only an http(s) origin is ever returned.
 */
export async function requestBaseUrl(): Promise<string> {
  const configured = safeBaseUrl(process.env.APP_BASE_URL);
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return "";
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  const fwd = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const proto = fwd === "http" || fwd === "https" ? fwd : /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? "http" : "https";
  return (host && safeBaseUrl(`${proto}://${host}`)) || "";
}

/** Everything the applicant functions need, for a server action. */
export async function joinDeps(): Promise<Deps> {
  return { db: prisma, mailer: createMailerFromEnv(), secret: codeSecret(), baseUrl: await requestBaseUrl() };
}

// Applicants, invites and join codes are global (not workspace-scoped), so the public join pages read them through
// these wrappers instead of importing the unscoped client.

/** Lobby state for an applicant id (null = row gone). */
export const loadLobbyState = (applicantId: string) => lobbyState(prisma, applicantId);

/** Public preview of a join code (null = unknown or switched off). */
export const loadJoinCode = (code: string) => describeJoinCode(prisma, code);

/** Public view of an invite token (null = unknown). Never render its `email`, only `maskedEmail`. */
export const loadInvite = (token: string) => describeInvite(prisma, token);

/** Accepts an invite by token for the signed-in applicant or a new name + password. */
export const acceptInviteBy = (token: string, who: Parameters<typeof acceptInvite>[2]) => acceptInvite(prisma, token, who);

// Admin side (Members → Requests and the invite-link card). Same reason: Applicant and Workspace are global.

/** What the Members page needs beyond the scoped client: the join-link settings and the join requests. */
export async function loadJoinAdmin(actor: Actor) {
  const [workspace, requests] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: actor.workspaceId }, select: { joinCode: true, joinLinkEnabled: true, emailDomain: true } }),
    listJoinRequests(prisma, actor),
  ]);
  return { workspace, requests };
}

export const approveFor = (actor: Actor, mailer: Mailer, applicantId: string, roles: { appRole: AppRole; jobRole: JobRole }, baseUrl: string, linkUserId?: string) =>
  approveApplicant(prisma, actor, mailer, applicantId, roles, baseUrl, linkUserId);
export const rejectFor = (actor: Actor, applicantId: string) => rejectApplicant(prisma, actor, applicantId);
export const undoRejectFor = (actor: Actor, applicantId: string) => undoReject(prisma, actor, applicantId);
export const resetLinkFor = (actor: Actor) => resetJoinLink(prisma, actor);
export const setLinkEnabledFor = (actor: Actor, enabled: boolean) => setJoinLinkEnabled(prisma, actor, enabled);

export const resetLinkUsable = (token: string) => isResetLinkUsable(prisma, token);
export const resetPasswordBy = (token: string, password: string) => resetPassword({ db: prisma }, token, password);
