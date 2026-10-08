import type { AppRole, PrismaClient } from "@prisma/client";
import { can } from "./permissions";
import { isHttpUrl } from "./fieldSchema";
import { bestEffort, buildMessage, notifierFor, type Notifier } from "./notify";

export type CollabCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "UNAUTHENTICATED";
export type CollabFail = { ok: false; code: CollabCode; message: string };
type Actor = { id: string; appRole: AppRole };

const fail = (code: CollabCode, message: string): CollabFail => ({ ok: false, code, message });

export const MAX_COMMENT = 5000;
export const MAX_ATTACHMENT_NAME = 200;
export const MAX_ATTACHMENT_URL = 2048;

/**
 * Mention rule: a token is `@` (not preceded by a letter/digit/underscore) followed by letters, digits, `_`, `-` or `.`;
 * trailing `.`/`-` are dropped so `@irsyad,` / `@irsyad.` work. Tokens and candidate keys are lowercased and have spaces
 * removed, so `@DimasPandu` matches the short name "Dimas Pandu". Candidate keys: the user's `name`, plus every alias
 * that is a single word (no spaces). Whole-token equality only (`@Dim` never matches Dimas). A token matching two
 * different ACTIVE users is ambiguous and ignored; unmatched tokens are plain text.
 */
export const MENTION_RE = /(?<![\p{L}\p{N}_])@([\p{L}\p{N}_][\p{L}\p{N}_.-]*)/gu;

export function mentionTokens(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(MENTION_RE)) out.push(m[1].replace(/[.-]+$/, "").toLowerCase());
  return out;
}

/** Splits text into plain and @mention segments (for highlighting without HTML). */
export function splitMentions(body: string): { text: string; mention: boolean }[] {
  const segs: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const full = m[0];
    const trimmed = full.replace(/[.-]+$/, "");
    const start = m.index!;
    if (start > last) segs.push({ text: body.slice(last, start), mention: false });
    segs.push({ text: trimmed, mention: true });
    last = start + trimmed.length;
  }
  if (last < body.length) segs.push({ text: body.slice(last), mention: false });
  return segs;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export async function resolveMentions(db: Pick<PrismaClient, "user">, body: string, authorId: string): Promise<string[]> {
  const tokens = new Set(mentionTokens(body).filter(Boolean));
  if (tokens.size === 0) return [];
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true, aliases: true } });
  const byKey = new Map<string, Set<string>>();
  for (const u of users) {
    const keys = [u.name, ...u.aliases.filter((a) => !/\s/.test(a.trim()))].map(norm).filter(Boolean);
    for (const k of keys) (byKey.get(k) ?? byKey.set(k, new Set()).get(k)!).add(u.id);
  }
  const ids = new Set<string>();
  for (const t of tokens) {
    const hit = byKey.get(t);
    if (hit && hit.size === 1) ids.add([...hit][0]);
  }
  ids.delete(authorId);
  return [...ids];
}

async function activeUser(db: Pick<PrismaClient, "user">, id: string) {
  const u = await db.user.findUnique({ where: { id }, select: { active: true } });
  return !!u?.active;
}

export async function addCommentWith(
  db: PrismaClient,
  user: Actor,
  requestId: string,
  body: string,
  now: Date = new Date(),
  notifier: Notifier = notifierFor(db),
): Promise<{ ok: true; commentId: string; mentionedUserIds: string[] } | CollabFail> {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return fail("INVALID", "Write a comment before posting.");
  if (text.length > MAX_COMMENT) return fail("INVALID", `Comments can be at most ${MAX_COMMENT} characters.`);
  if (!(await activeUser(db, user.id))) return fail("FORBIDDEN", "Your account is not active.");
  const req = await db.request.findUnique({ where: { id: requestId }, select: { id: true, title: true, requesterId: true, assigneeId: true } });
  if (!req) return fail("NOT_FOUND", "Request not found.");
  const mentionedUserIds = await resolveMentions(db, text, user.id);
  const c = await db.comment.create({ data: { requestId, authorId: user.id, body: text, mentions: mentionedUserIds, createdAt: now } });
  await bestEffort(async () => {
    const actor = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
    const name = actor?.name ?? "Someone";
    const calls: Promise<void>[] = [];
    if (mentionedUserIds.length)
      calls.push(notifier({ actorId: user.id, userIds: mentionedUserIds, requestId, type: "MENTION", message: buildMessage("MENTION", name, req.title) }));
    const others = [req.requesterId, req.assigneeId].filter((id): id is string => !!id && id !== user.id && !mentionedUserIds.includes(id));
    if (others.length)
      calls.push(notifier({ actorId: user.id, userIds: [...new Set(others)], requestId, type: "COMMENT", message: buildMessage("COMMENT", name, req.title) }));
    await Promise.allSettled(calls);
  });
  return { ok: true, commentId: c.id, mentionedUserIds };
}

export async function assignRequestWith(
  db: PrismaClient,
  user: Actor,
  requestId: string,
  assigneeId: string | null,
  notifier: Notifier = notifierFor(db),
): Promise<{ ok: true } | CollabFail> {
  if (!can(user.appRole, "request.assign")) return fail("FORBIDDEN", "Only leads and admins can assign requests.");
  const req = await db.request.findUnique({ where: { id: requestId }, select: { status: true, assigneeId: true, title: true } });
  if (!req) return fail("NOT_FOUND", "Request not found.");
  if (req.status === "CANCELLED") return fail("INVALID", "A cancelled request cannot be reassigned.");
  if (assigneeId !== null) {
    const a = await db.user.findUnique({ where: { id: assigneeId }, select: { active: true, appRole: true } });
    if (!a) return fail("NOT_FOUND", "Assignee not found.");
    if (!a.active) return fail("INVALID", "That person is no longer active.");
    if (a.appRole === "REQUESTER") return fail("INVALID", "Requesters cannot be assignees. Pick a creative, lead or admin.");
  }
  // Atomic guard: a request cancelled after the reads above matches 0 rows instead of being reassigned.
  const res = await db.request.updateMany({ where: { id: requestId, status: { not: "CANCELLED" } }, data: { assigneeId } });
  if (res.count === 0) {
    const now = await db.request.findUnique({ where: { id: requestId }, select: { status: true } });
    return now ? fail("INVALID", "A cancelled request cannot be reassigned.") : fail("NOT_FOUND", "Request not found.");
  }
  if (assigneeId !== null && assigneeId !== req.assigneeId) {
    await bestEffort(async () => {
      const actor = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
      await notifier({ actorId: user.id, userIds: [assigneeId], requestId, type: "ASSIGNED", message: buildMessage("ASSIGNED", actor?.name ?? "Someone", req.title) });
    });
  }
  return { ok: true };
}

export async function addAttachmentWith(
  db: PrismaClient,
  user: Actor,
  requestId: string,
  input: { name: string; url: string },
): Promise<{ ok: true; id: string } | CollabFail> {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const url = typeof input?.url === "string" ? input.url.trim() : "";
  if (!name) return fail("INVALID", "Give the link a name.");
  if (name.length > MAX_ATTACHMENT_NAME) return fail("INVALID", `Link names can be at most ${MAX_ATTACHMENT_NAME} characters.`);
  if (url.length > MAX_ATTACHMENT_URL) return fail("INVALID", `Links can be at most ${MAX_ATTACHMENT_URL} characters.`);
  if (!isHttpUrl(url)) return fail("INVALID", "Enter a full http(s) link, for example https://drive.google.com/…");
  if (!(await activeUser(db, user.id))) return fail("FORBIDDEN", "Your account is not active.");
  const req = await db.request.findUnique({ where: { id: requestId }, select: { id: true } });
  if (!req) return fail("NOT_FOUND", "Request not found.");
  const a = await db.attachment.create({ data: { requestId, uploaderId: user.id, name, url } });
  return { ok: true, id: a.id };
}

/** Only the uploader or a lead/admin may remove a link. The link must belong to `requestId`. */
export async function removeAttachmentWith(db: PrismaClient, user: Actor, requestId: string, attachmentId: string): Promise<{ ok: true } | CollabFail> {
  const a = await db.attachment.findUnique({ where: { id: attachmentId }, select: { uploaderId: true, requestId: true } });
  if (!a || a.requestId !== requestId) return fail("NOT_FOUND", "Link not found.");
  if (a.uploaderId !== user.id && !can(user.appRole, "request.assign")) return fail("FORBIDDEN", "Only the person who added a link, or a lead, can remove it.");
  await db.attachment.delete({ where: { id: attachmentId } });
  return { ok: true };
}

/** Lead/admin: include or exclude a request from KPI counting (the `includeKpi` flag the KPI rules already honour). */
export async function setIncludeKpiWith(db: PrismaClient, user: Actor, requestId: string, value: boolean): Promise<{ ok: true } | CollabFail> {
  if (!can(user.appRole, "request.assign")) return fail("FORBIDDEN", "Only leads and admins can change whether a request counts toward KPI.");
  if (typeof value !== "boolean") return fail("INVALID", "Choose yes or no.");
  const res = await db.request.updateMany({ where: { id: requestId }, data: { includeKpi: value } });
  if (res.count === 0) return fail("NOT_FOUND", "Request not found.");
  return { ok: true };
}
