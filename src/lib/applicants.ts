import { Prisma, type Applicant, type JoinSource, type PrismaClient } from "@prisma/client";
import { createMailerFromEnv, type Mailer } from "@/lib/mailer";
import { bestEffort } from "@/lib/notify";
import { notifyJoinRequest } from "@/lib/joinRequests";
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
  /** Called once after any join request is written; default: notifyJoinRequest (bell + email to the admins). */
  onRequest?: (applicantId: string) => Promise<void>;
};

/** What requestWorkspace needs: the db, and optionally the hook or a mailer for the default notification. */
type RequestDeps = Pick<Deps, "db" | "onRequest"> & { mailer?: Mailer };

/** Runs the onRequest hook (default: notify the admins). Best-effort: a failure never fails the request. */
function announceRequest(d: RequestDeps, applicantId: string): Promise<void> {
  return bestEffort(() =>
    d.onRequest ? d.onRequest(applicantId) : notifyJoinRequest(d.db, d.mailer ?? createMailerFromEnv(), applicantId),
  );
}

const HOUR_MS = 3_600_000;

const nowOf = (d: { now?: Date }) => d.now ?? new Date();

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export type JoinNotice = "LINK_INVALID" | "INACTIVE_MEMBER" | "REJECTED";

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
 * Creates (or replaces an unverified) applicant and emails a 6-digit code. If the email already belongs to a user
 * or a verified applicant, sends "you already have an account" instead and returns `applicantId: null`, so the page
 * looks the same either way.
 *
 * Replacing an unverified row always gives it a fresh id, so a session issued for the earlier sign-up (possibly an
 * attacker's) never points at the row the owner verifies. Over the resend limits (60 s gap, 5 per hour) the row is
 * still replaced but no email goes out and nothing is thrown: the earlier code keeps working (attempts carried over)
 * and the owner can use Resend once the window allows. `createdAt` keeps the first sign-up time, so the 7-day cleanup
 * still applies.
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
  const fields = { email, name, passwordHash, joinCode };
  try {
    return await signUpOnce(d, now, fields);
  } catch (e) {
    // A concurrent sign-up for the same email won the insert (or replaced the row first): go round once more.
    if (!isUniqueViolation(e) && !(e instanceof RowGone)) throw e;
    return signUpOnce(d, now, fields);
  }
}

class RowGone extends Error {}

async function signUpOnce(
  d: Deps,
  now: Date,
  f: { email: string; name: string; passwordHash: string; joinCode: string | null },
): Promise<{ applicantId: string | null }> {
  const [user, existing] = await Promise.all([findUserByEmail(d.db, f.email), d.db.applicant.findUnique({ where: { email: f.email } })]);
  if (user || existing?.emailVerifiedAt) {
    await d.mailer.send({ to: f.email, ...alreadyHaveAccountEmail({ signinUrl: `${d.baseUrl}/signin` }) });
    return { applicantId: null };
  }
  const base = { email: f.email, name: f.name, passwordHash: f.passwordHash, pendingJoinCode: f.joinCode };

  if (!existing) {
    const fresh = freshCode(d.secret, now, 0);
    const row = await d.db.applicant.create({ data: { ...base, createdAt: now, ...fresh.data } });
    await d.mailer.send({ to: f.email, ...codeEmail(fresh.code) });
    return { applicantId: row.id };
  }

  const tooSoon = existing.codeSentAt !== null && now.getTime() - existing.codeSentAt.getTime() < RESEND_GAP_MS;
  const windowCount = sendsInWindow(existing, now);
  const fresh = !tooSoon && windowCount < RESENDS_PER_HOUR ? freshCode(d.secret, now, windowCount) : null;
  const kept = {
    codeHash: existing.codeHash,
    codeExpiresAt: existing.codeExpiresAt,
    codeAttempts: existing.codeAttempts,
    codeSentAt: existing.codeSentAt,
    codesSentInWindow: existing.codesSentInWindow,
  };
  const row = await d.db.$transaction(async (tx) => {
    const del = await tx.applicant.deleteMany({ where: { id: existing.id, emailVerifiedAt: null } });
    if (del.count === 0) throw new RowGone();
    return tx.applicant.create({ data: { ...base, createdAt: existing.createdAt, ...(fresh ? fresh.data : kept) } });
  });
  if (fresh) await d.mailer.send({ to: f.email, ...codeEmail(fresh.code) });
  return { applicantId: row.id };
}

/**
 * Checks the code (15 min, 5 attempts). On success marks the email verified and routes the applicant: a saved join
 * link -> request with source LINK; else a workspace on the email's domain -> request with source DOMAIN.
 * `joined` = a join request now exists. Once verification is committed this never throws: `notice` says why no
 * request was made (stale link, deactivated member, rejected). CODE_INVALID / CODE_EXPIRED / TOO_MANY are thrown
 * before anything is committed.
 *
 * Each guess consumes an attempt atomically before the comparison, so parallel guesses can't exceed the limit.
 */
export async function verifyCode(
  d: Deps,
  applicantId: string,
  code: string,
): Promise<{ joined: boolean; notice?: JoinNotice }> {
  const now = nowOf(d);
  const a = await d.db.applicant.findUnique({ where: { id: applicantId } });
  if (!a) throw new JoinError("CODE_INVALID", "That code isn't right.");
  if (a.emailVerifiedAt) return { joined: a.requestedWorkspaceId !== null };
  if (!a.codeHash) throw new JoinError("CODE_INVALID", "That code isn't right.");

  const consumed = await d.db.applicant.updateMany({
    where: { id: a.id, codeHash: a.codeHash, emailVerifiedAt: null, codeAttempts: { lt: CODE_MAX_ATTEMPTS }, codeExpiresAt: { gt: now } },
    data: { codeAttempts: { increment: 1 } },
  });
  if (consumed.count === 0) {
    const cur = await d.db.applicant.findUnique({ where: { id: a.id } });
    if (cur?.emailVerifiedAt) return { joined: cur.requestedWorkspaceId !== null };
    if (!cur || cur.codeHash !== a.codeHash || !cur.codeExpiresAt) throw new JoinError("CODE_INVALID", "That code isn't right.");
    if (cur.codeAttempts >= CODE_MAX_ATTEMPTS) throw new JoinError("TOO_MANY", "Too many wrong codes. Ask for a new one.");
    throw new JoinError("CODE_EXPIRED", "That code has expired. Ask for a new one.");
  }

  if (!codeMatches((code ?? "").trim(), a.codeHash, d.secret)) {
    const cur = await d.db.applicant.findUnique({ where: { id: a.id }, select: { codeAttempts: true } });
    if (!cur || cur.codeAttempts >= CODE_MAX_ATTEMPTS) throw new JoinError("TOO_MANY", "Too many wrong codes. Ask for a new one.");
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

  return routeVerified(d, a.id, a.email, a.pendingJoinCode, now);
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
 * Applicant for a trusted OAuth identity (email counts as verified). Creates one if needed and routes it by email
 * domain. An existing unverified row was made by whoever typed this email into the form (maybe not its owner), so it
 * is replaced by a fresh row (new id, Google name, no password, no saved join link). Throws INACTIVE_MEMBER for a
 * deactivated user's email, VALIDATION for an active user's (callers sign members in before reaching this).
 */
export async function oauthApplicant(
  d: Pick<Deps, "db" | "now" | "onRequest"> & { mailer?: Mailer },
  profile: { email: string; name: string },
): Promise<Applicant> {
  const now = nowOf(d);
  const email = normalize(profile.email);
  const user = await findUserByEmail(d.db, email);
  if (user && !user.active) throw new JoinError("INACTIVE_MEMBER", "This email belongs to a deactivated account. Contact your admin.");
  if (user) throw new JoinError("VALIDATION", "This email already has an account.");

  const name = (profile.name ?? "").trim() || email.slice(0, email.indexOf("@"));
  const data = { email, name, emailVerifiedAt: now, createdAt: now };
  // null = the unverified row changed under us (go round again).
  const create = async (): Promise<{ row: Applicant; isNew: boolean } | null> => {
    const existing = await d.db.applicant.findUnique({ where: { email } });
    if (existing?.emailVerifiedAt) return { row: existing, isNew: false };
    if (!existing) return { row: await d.db.applicant.create({ data }), isNew: true };
    const row = await d.db.$transaction(async (tx) => {
      const del = await tx.applicant.deleteMany({ where: { id: existing.id, emailVerifiedAt: null } });
      return del.count === 0 ? null : tx.applicant.create({ data });
    });
    return row ? { row, isNew: true } : null;
  };
  let got: { row: Applicant; isNew: boolean } | null;
  try {
    got = await create();
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    got = null;
  }
  got ??= await create();
  if (!got) throw new JoinError("VALIDATION", "Please try again.");
  const { row, isNew } = got;
  if (!isNew) return row;
  await routeVerified(d, row.id, email, null, now);
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
 * Writes the join request and notifies once. Same workspace already pending -> no-op. A rejected applicant can't
 * request any workspace (REJECTED) until an admin undoes the rejection. Asking for another workspace replaces the
 * previous request.
 */
async function requestWorkspace(
  d: RequestDeps,
  a: Pick<Applicant, "id" | "requestedWorkspaceId" | "rejectedAt">,
  workspaceId: string,
  source: JoinSource,
  now: Date,
): Promise<void> {
  if (a.rejectedAt) throw new JoinError("REJECTED", "Your join request was declined. Contact the workspace admin.");
  if (a.requestedWorkspaceId === workspaceId) return;
  const res = await d.db.applicant.updateMany({
    where: { id: a.id, rejectedAt: null },
    data: { requestedWorkspaceId: workspaceId, requestedAt: now, requestSource: source, pendingJoinCode: null },
  });
  if (res.count === 0) throw new JoinError("REJECTED", "Your join request was declined. Contact the workspace admin.");
  await announceRequest(d, a.id);
}

/**
 * After verification: saved join link first, then the email domain. Clears the saved link either way. Never throws
 * a JoinError: a reason for not requesting comes back as `notice`.
 */
async function routeVerified(
  d: RequestDeps,
  id: string,
  email: string,
  pendingJoinCode: string | null,
  now: Date,
): Promise<{ joined: boolean; notice?: JoinNotice }> {
  if (pendingJoinCode) await d.db.applicant.update({ where: { id }, data: { pendingJoinCode: null } });
  const u = await findUserByEmail(d.db, email);
  if (u && !u.active) return { joined: false, notice: "INACTIVE_MEMBER" };
  const a = await d.db.applicant.findUniqueOrThrow({ where: { id } });
  if (a.rejectedAt) return { joined: false, notice: "REJECTED" };
  if (a.requestedWorkspaceId) return { joined: true };

  let notice: JoinNotice | undefined;
  let target: { id: string; source: JoinSource } | null = null;
  if (pendingJoinCode) {
    const ws = await workspaceByJoinCode(d.db, pendingJoinCode);
    if (ws) target = { id: ws.id, source: "LINK" };
    else notice = "LINK_INVALID";
  }
  if (!target) {
    const byDomain = await d.db.workspace.findUnique({ where: { emailDomain: domainOf(email) }, select: { id: true } });
    if (byDomain) target = { id: byDomain.id, source: "DOMAIN" };
  }
  if (!target) return notice ? { joined: false, notice } : { joined: false };
  try {
    await requestWorkspace(d, a, target.id, target.source, now);
  } catch (e) {
    if (e instanceof JoinError && e.code === "REJECTED") return { joined: false, notice: "REJECTED" };
    throw e;
  }
  return { joined: true };
}
