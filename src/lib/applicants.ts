import type { Applicant, JoinSource, PrismaClient } from "@prisma/client";
import type { Mailer } from "@/lib/mailer";
import { checkNewPassword, hashPassword } from "@/lib/password";
import { alreadyHaveAccountEmail, codeEmail } from "@/lib/joinEmails";
import {
  CODE_MAX_ATTEMPTS, CODE_TTL_MS, RESEND_GAP_MS, RESENDS_PER_HOUR, UNVERIFIED_TTL_MS, codeMatches, hashCode, newCode,
} from "@/lib/joinTokens";

export type JoinErrorCode =
  | "VALIDATION" | "LINK_INVALID" | "CODE_INVALID" | "CODE_EXPIRED" | "TOO_MANY" | "RATE_LIMITED" | "REJECTED"
  | "INACTIVE_MEMBER";

export class JoinError extends Error {
  constructor(
    public code: JoinErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "JoinError";
  }
}

export type Deps = {
  db: PrismaClient;
  mailer: Mailer;
  /** HMAC secret for verification codes (see codeSecret()). */
  secret: string;
  now?: Date;
  /** Origin used for links in emails, e.g. "https://cloworks.vercel.app". */
  baseUrl: string;
  /** Called once after any join request is written (admins get notified). */
  onRequest?: (applicantId: string) => Promise<void>;
};

const HOUR_MS = 3_600_000;

const nowOf = (d: { now?: Date }) => d.now ?? new Date();

/** Trimmed, lowercased; one "@" with something on both sides, no spaces. */
function normalize(raw: string): string {
  const e = (raw ?? "").trim().toLowerCase();
  const parts = e.split("@");
  if (!e || e.length > 254 || /\s/.test(e) || parts.length !== 2 || !parts[0] || !parts[1])
    throw new JoinError("VALIDATION", "Enter a valid email address.");
  return e;
}

const domainOf = (email: string) => email.slice(email.indexOf("@") + 1);

function findUserByEmail(db: PrismaClient, email: string) {
  return db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, active: true } });
}

async function assertNotInactiveMember(db: PrismaClient, email: string) {
  const u = await findUserByEmail(db, email);
  if (u && !u.active) throw new JoinError("INACTIVE_MEMBER", "This email belongs to a deactivated account. Contact your admin.");
}

/**
 * Resend window without extra columns: `codeSentAt` is the last send and `codesSentInWindow` counts sends since the
 * window opened. The window closes (counter resets) once the last send is more than an hour old.
 */
function sendsInWindow(a: Pick<Applicant, "codeSentAt" | "codesSentInWindow">, now: Date): number {
  return a.codeSentAt && now.getTime() - a.codeSentAt.getTime() < HOUR_MS ? a.codesSentInWindow : 0;
}

function freshCode(secret: string, now: Date, windowCount: number) {
  const code = newCode();
  return {
    code,
    data: {
      codeHash: hashCode(code, secret),
      codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      codeAttempts: 0,
      codeSentAt: now,
      codesSentInWindow: windowCount + 1,
    },
  };
}

/**
 * Creates (or overwrites an unverified) applicant and emails a 6-digit code. If the email already belongs to a user
 * or a verified applicant, sends "you already have an account" instead and returns `applicantId: null`, so the page
 * looks the same either way.
 */
export async function signUp(
  d: Deps,
  input: { name: string; email: string; password: string; joinCode?: string },
): Promise<{ applicantId: string | null }> {
  const now = nowOf(d);
  const name = (input.name ?? "").trim();
  if (!name) throw new JoinError("VALIDATION", "Enter your name.");
  const email = normalize(input.email);
  const pwProblem = checkNewPassword(input.password ?? "");
  if (pwProblem) throw new JoinError("VALIDATION", pwProblem);
  const joinCode = input.joinCode?.trim() || null;

  // Opportunistic cleanup: no cron for unverified rows.
  await d.db.applicant.deleteMany({
    where: { emailVerifiedAt: null, createdAt: { lt: new Date(now.getTime() - UNVERIFIED_TTL_MS) } },
  });

  // Hash before branching so both outcomes take about as long.
  const passwordHash = await hashPassword(input.password);

  const [user, existing] = await Promise.all([findUserByEmail(d.db, email), d.db.applicant.findUnique({ where: { email } })]);
  if (user || existing?.emailVerifiedAt) {
    await d.mailer.send({ to: email, ...alreadyHaveAccountEmail({ signinUrl: `${d.baseUrl}/signin` }) });
    return { applicantId: null };
  }

  let id: string;
  let code: string;
  if (existing) {
    const windowCount = sendsInWindow(existing, now);
    if (windowCount >= RESENDS_PER_HOUR) throw new JoinError("RATE_LIMITED", "Too many codes sent. Try again in an hour.");
    const fresh = freshCode(d.secret, now, windowCount);
    code = fresh.code;
    await d.db.applicant.update({
      where: { id: existing.id },
      data: { name, passwordHash, pendingJoinCode: joinCode, createdAt: now, failedLogins: 0, lockedUntil: null, ...fresh.data },
    });
    id = existing.id;
  } else {
    const fresh = freshCode(d.secret, now, 0);
    code = fresh.code;
    const row = await d.db.applicant.create({
      data: { email, name, passwordHash, pendingJoinCode: joinCode, createdAt: now, ...fresh.data },
    });
    id = row.id;
  }
  await d.mailer.send({ to: email, ...codeEmail(code) });
  return { applicantId: id };
}

/**
 * Checks the code (15 min, 5 attempts). On success marks the email verified and routes the applicant: a saved join
 * link → request with source LINK; else a workspace on the email's domain → request with source DOMAIN.
 * `joined` = a join request now exists. Throws LINK_INVALID (after verifying) when the saved link no longer works and
 * no domain workspace matched.
 */
export async function verifyCode(d: Deps, applicantId: string, code: string): Promise<{ joined: boolean }> {
  const now = nowOf(d);
  const a = await d.db.applicant.findUnique({ where: { id: applicantId } });
  if (!a) throw new JoinError("CODE_INVALID", "That code isn't right.");
  if (a.emailVerifiedAt) return { joined: a.requestedWorkspaceId !== null };
  if (a.codeAttempts >= CODE_MAX_ATTEMPTS) throw new JoinError("TOO_MANY", "Too many wrong codes. Ask for a new one.");
  if (!a.codeHash || !a.codeExpiresAt) throw new JoinError("CODE_INVALID", "That code isn't right.");
  if (now.getTime() > a.codeExpiresAt.getTime()) throw new JoinError("CODE_EXPIRED", "That code has expired. Ask for a new one.");

  if (!codeMatches((code ?? "").trim(), a.codeHash, d.secret)) {
    const bumped = await d.db.applicant.updateMany({
      where: { id: a.id, codeHash: a.codeHash, codeAttempts: { lt: CODE_MAX_ATTEMPTS } },
      data: { codeAttempts: { increment: 1 } },
    });
    if (bumped.count === 0 || a.codeAttempts + 1 >= CODE_MAX_ATTEMPTS)
      throw new JoinError("TOO_MANY", "Too many wrong codes. Ask for a new one.");
    throw new JoinError("CODE_INVALID", "That code isn't right.");
  }

  // Guard on the hash so two concurrent correct submissions verify once.
  const done = await d.db.applicant.updateMany({
    where: { id: a.id, codeHash: a.codeHash, emailVerifiedAt: null },
    data: { emailVerifiedAt: now, codeHash: null, codeExpiresAt: null, codeAttempts: 0 },
  });
  if (done.count === 0) {
    const cur = await d.db.applicant.findUnique({ where: { id: a.id } });
    if (cur?.emailVerifiedAt) return { joined: cur.requestedWorkspaceId !== null };
    throw new JoinError("CODE_INVALID", "That code isn't right.");
  }

  const r = await routeVerified(d, a.id, a.email, a.pendingJoinCode, now);
  if (r.linkInvalid && !r.joined) throw new JoinError("LINK_INVALID", "This join link is no longer valid. Ask your admin for a new one.");
  return { joined: r.joined };
}

/** New code by email: at least 60 s apart, at most 5 sends per hour (the sign-up code counts). */
export async function resendCode(d: Deps, applicantId: string): Promise<void> {
  const now = nowOf(d);
  const a = await d.db.applicant.findUnique({ where: { id: applicantId } });
  if (!a || a.emailVerifiedAt) throw new JoinError("VALIDATION", "There is nothing to verify.");
  if (a.codeSentAt && now.getTime() - a.codeSentAt.getTime() < RESEND_GAP_MS)
    throw new JoinError("RATE_LIMITED", "Wait a minute before asking for another code.");
  const windowCount = sendsInWindow(a, now);
  if (windowCount >= RESENDS_PER_HOUR) throw new JoinError("RATE_LIMITED", "Too many codes sent. Try again in an hour.");
  const fresh = freshCode(d.secret, now, windowCount);
  // Conditional on the previous send so two concurrent resends can't both pass the limits.
  const res = await d.db.applicant.updateMany({
    where: { id: a.id, emailVerifiedAt: null, codeSentAt: a.codeSentAt, codesSentInWindow: a.codesSentInWindow },
    data: fresh.data,
  });
  if (res.count === 0) throw new JoinError("RATE_LIMITED", "Wait a minute before asking for another code.");
  await d.mailer.send({ to: a.email, ...codeEmail(fresh.code) });
}

/** Lobby: paste a join link/code to request that workspace. */
export async function requestJoinByCode(d: Deps, applicantId: string, joinCode: string): Promise<void> {
  const now = nowOf(d);
  const a = await d.db.applicant.findUnique({ where: { id: applicantId } });
  if (!a || !a.emailVerifiedAt) throw new JoinError("VALIDATION", "Verify your email first.");
  await assertNotInactiveMember(d.db, a.email);
  const ws = await workspaceByJoinCode(d.db, joinCode);
  if (!ws) throw new JoinError("LINK_INVALID", "This join link is no longer valid. Ask your admin for a new one.");
  await requestWorkspace(d, a, ws.id, "LINK", now);
}

/**
 * Applicant for a trusted OAuth identity (email counts as verified). Creates one if needed, or verifies an
 * unverified one, then routes it like verifyCode. A stale saved join link is dropped silently here (sign-in must not
 * fail). Throws INACTIVE_MEMBER for a deactivated user's email, VALIDATION for an active user's (callers sign
 * members in before reaching this).
 */
export async function oauthApplicant(
  d: Pick<Deps, "db" | "now" | "onRequest">,
  profile: { email: string; name: string },
): Promise<Applicant> {
  const now = nowOf(d);
  const email = normalize(profile.email);
  const user = await findUserByEmail(d.db, email);
  if (user && !user.active) throw new JoinError("INACTIVE_MEMBER", "This email belongs to a deactivated account. Contact your admin.");
  if (user) throw new JoinError("VALIDATION", "This email already has an account.");

  const existing = await d.db.applicant.findUnique({ where: { email } });
  if (existing?.emailVerifiedAt) return existing;

  let row: Applicant;
  if (existing) {
    row = await d.db.applicant.update({
      where: { id: existing.id },
      data: { emailVerifiedAt: now, codeHash: null, codeExpiresAt: null, codeAttempts: 0 },
    });
  } else {
    const name = (profile.name ?? "").trim() || email.slice(0, email.indexOf("@"));
    row = await d.db.applicant.create({ data: { email, name, emailVerifiedAt: now, createdAt: now } });
  }
  await routeVerified(d, row.id, email, row.pendingJoinCode, now);
  return d.db.applicant.findUniqueOrThrow({ where: { id: row.id } });
}

/** Public preview for /join/<code>: null when the code is unknown or the link is switched off. */
export async function describeJoinCode(db: PrismaClient, joinCode: string): Promise<{ workspaceName: string } | null> {
  const ws = await workspaceByJoinCode(db, joinCode);
  return ws ? { workspaceName: ws.name } : null;
}

export type LobbyState =
  | { kind: "unverified" }
  | { kind: "waiting"; workspaceName: string }
  | { kind: "none" }
  | { kind: "rejected"; workspaceName: string };

/** What the lobby shows; null = the applicant row is gone (approved, cleaned up or deleted). */
export async function lobbyState(db: PrismaClient, applicantId: string): Promise<LobbyState | null> {
  const a = await db.applicant.findUnique({
    where: { id: applicantId },
    select: { emailVerifiedAt: true, rejectedAt: true, requestedWorkspace: { select: { name: true } } },
  });
  if (!a) return null;
  if (!a.emailVerifiedAt) return { kind: "unverified" };
  if (!a.requestedWorkspace) return { kind: "none" };
  return a.rejectedAt
    ? { kind: "rejected", workspaceName: a.requestedWorkspace.name }
    : { kind: "waiting", workspaceName: a.requestedWorkspace.name };
}

// ---------------------------------------------------------------------------------------------------------------

async function workspaceByJoinCode(db: PrismaClient, joinCode: string) {
  const c = (joinCode ?? "").trim();
  if (!c) return null;
  const ws = await db.workspace.findUnique({ where: { joinCode: c }, select: { id: true, name: true, joinLinkEnabled: true } });
  return ws?.joinLinkEnabled ? ws : null;
}

/**
 * Writes the join request and notifies once. Same workspace already pending → no-op; same workspace rejected →
 * REJECTED. Asking for another workspace replaces the previous request.
 */
async function requestWorkspace(
  d: Pick<Deps, "db" | "onRequest">,
  a: Pick<Applicant, "id" | "requestedWorkspaceId" | "rejectedAt">,
  workspaceId: string,
  source: JoinSource,
  now: Date,
): Promise<void> {
  if (a.requestedWorkspaceId === workspaceId) {
    if (a.rejectedAt) throw new JoinError("REJECTED", "This workspace declined your request.");
    return;
  }
  await d.db.applicant.update({
    where: { id: a.id },
    data: { requestedWorkspaceId: workspaceId, requestedAt: now, requestSource: source, rejectedAt: null, pendingJoinCode: null },
  });
  await d.onRequest?.(a.id);
}

/** After verification: saved join link first, then the email domain. Clears the saved link either way. */
async function routeVerified(
  d: Pick<Deps, "db" | "onRequest">,
  id: string,
  email: string,
  pendingJoinCode: string | null,
  now: Date,
): Promise<{ joined: boolean; linkInvalid: boolean }> {
  if (pendingJoinCode) await d.db.applicant.update({ where: { id }, data: { pendingJoinCode: null } });
  await assertNotInactiveMember(d.db, email);
  const a = await d.db.applicant.findUniqueOrThrow({ where: { id } });
  if (a.requestedWorkspaceId) return { joined: true, linkInvalid: false };

  let linkInvalid = false;
  if (pendingJoinCode) {
    const ws = await workspaceByJoinCode(d.db, pendingJoinCode);
    if (ws) {
      await requestWorkspace(d, a, ws.id, "LINK", now);
      return { joined: true, linkInvalid: false };
    }
    linkInvalid = true;
  }
  const byDomain = await d.db.workspace.findUnique({ where: { emailDomain: domainOf(email) }, select: { id: true } });
  if (byDomain) {
    await requestWorkspace(d, a, byDomain.id, "DOMAIN", now);
    return { joined: true, linkInvalid };
  }
  return { joined: false, linkInvalid };
}
