import { headers } from "next/headers";
import { describeJoinCode, lobbyState, type Deps } from "./applicants";
import { acceptInvite, describeInvite } from "./invites";
import { prisma } from "./db";
import { createMailerFromEnv } from "./mailer";
import { safeBaseUrl } from "./notify";
import { codeSecret } from "./joinTokens";

/**
 * Origin for links in emails: APP_BASE_URL when set, else this request's origin (Host + x-forwarded-proto). Only an
 * http(s) origin is ever returned.
 */
export async function requestBaseUrl(): Promise<string> {
  const configured = safeBaseUrl(process.env.APP_BASE_URL);
  if (configured) return configured;
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
