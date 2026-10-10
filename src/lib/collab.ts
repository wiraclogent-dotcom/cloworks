import type { AppRole, PrismaClient } from "@prisma/client";
import { can } from "./permissions";
import { isHttpUrl } from "./fieldSchema";
import { bestEffort, buildMessage, notifierFor, type Notifier } from "./notify";
import { mentionTokens } from "./mentions";

export type CollabCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "UNAUTHENTICATED";
export type CollabFail = { ok: false; code: CollabCode; message: string };
type Actor = { id: string; appRole: AppRole };

const fail = (code: CollabCode, message: string): CollabFail => ({ ok: false, code, message });

export const MAX_COMMENT = 5000;
export const MAX_ATTACHMENT_NAME = 200;
export const MAX_ATTACHMENT_URL = 2048;

export { MENTION_RE, mentionTokens, splitMentions } from "./mentions";

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
    const a = await db.user.findUnique({ where: { id: assigneeId }, select: { active: true, appRole: true, jobRole: true } });
    if (!a) return fail("NOT_FOUND", "Assignee not found.");
    if (!a.active) return fail("INVALID", "That person is no longer active.");
    if (a.appRole === "REQUESTER") return fail("INVALID", "Requesters cannot be assignees. Pick a creative, lead or admin.");
    // Same rule as listCreativeTeam (src/lib/team.ts): the creative team is the designers.
    if (a.jobRole !== "DESIGNER") return fail("INVALID", "Only creative team members can be assignees.");
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
  notifier: Notifier = notifierFor(db),
): Promise<{ ok: true; id: string } | CollabFail> {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const url = typeof input?.url === "string" ? input.url.trim() : "";
  if (!name) return fail("INVALID", "Give the link a name.");
  if (name.length > MAX_ATTACHMENT_NAME) return fail("INVALID", `Link names can be at most ${MAX_ATTACHMENT_NAME} characters.`);
  if (url.length > MAX_ATTACHMENT_URL) return fail("INVALID", `Links can be at most ${MAX_ATTACHMENT_URL} characters.`);
  if (!isHttpUrl(url)) return fail("INVALID", "Enter a full http(s) link, for example https://drive.google.com/…");
  if (!(await activeUser(db, user.id))) return fail("FORBIDDEN", "Your account is not active.");
  const req = await db.request.findUnique({ where: { id: requestId }, select: { title: true, requesterId: true, assigneeId: true } });
  if (!req) return fail("NOT_FOUND", "Request not found.");
  const a = await db.attachment.create({ data: { requestId, uploaderId: user.id, name, url } });
  // In-app only: a burst of links should not flood anyone's email.
  const userIds = [...new Set([req.requesterId, req.assigneeId])].filter((id): id is string => !!id && id !== user.id);
  if (userIds.length)
    await bestEffort(async () => {
      const actor = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
      await notifier({ actorId: user.id, userIds, requestId, type: "ATTACHMENT", email: false, message: buildMessage("ATTACHMENT", actor?.name ?? "Someone", req.title, undefined, { name }) });
    });
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

/** Lead/admin: mark (or unmark) a request as also needing motion/video work. A flag only; no second card. */
export async function setNeedsMotionWith(db: PrismaClient, user: Actor, requestId: string, value: boolean): Promise<{ ok: true } | CollabFail> {
  if (!can(user.appRole, "request.assign")) return fail("FORBIDDEN", "Only leads and admins can change whether a task needs motion.");
  if (typeof value !== "boolean") return fail("INVALID", "Choose yes or no.");
  const res = await db.request.updateMany({ where: { id: requestId }, data: { needsMotion: value } });
  if (res.count === 0) return fail("NOT_FOUND", "Request not found.");
  return { ok: true };
}
