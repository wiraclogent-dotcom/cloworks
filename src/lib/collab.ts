import type { AppRole, PrismaClient } from "@prisma/client";
import { can } from "./permissions";
import { FILE_LOCATION_HINT, isFileLocation } from "./fileLocation";
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
  const req = await db.request.findUnique({ where: { id: requestId }, select: { id: true, title: true, requesterId: true, assignees: { select: { userId: true } } } });
  if (!req) return fail("NOT_FOUND", "Request not found.");
  const mentionedUserIds = await resolveMentions(db, text, user.id);
  const c = await db.comment.create({ data: { requestId, authorId: user.id, body: text, mentions: mentionedUserIds, createdAt: now } });
  await bestEffort(async () => {
    const actor = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
    const name = actor?.name ?? "Someone";
    const calls: Promise<void>[] = [];
    if (mentionedUserIds.length)
      calls.push(notifier({ actorId: user.id, userIds: mentionedUserIds, requestId, type: "MENTION", message: buildMessage("MENTION", name, req.title) }));
    const others = [req.requesterId, ...req.assignees.map((a) => a.userId)].filter((id) => id !== user.id && !mentionedUserIds.includes(id));
    if (others.length)
      calls.push(notifier({ actorId: user.id, userIds: [...new Set(others)], requestId, type: "COMMENT", message: buildMessage("COMMENT", name, req.title) }));
    await Promise.allSettled(calls);
  });
  return { ok: true, commentId: c.id, mentionedUserIds };
}

class CancelledDuringAssign extends Error {}
class AssignRejected extends Error {
  constructor(readonly result: CollabFail) { super(result.message); }
}

/** One change to a request's assignees: people to add and/or people to remove. */
export type AssigneeChange = { add?: string[]; remove?: string[] };
/** Most ids `add` or `remove` may name in one change (the picker sends one). */
export const MAX_ASSIGNEE_CHANGE = 20;

/** `add` / `remove` as a deduped id list, or why it is not one. Absent is an empty list. */
function changeIds(v: unknown): string[] | CollabFail {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((id) => typeof id === "string")) return fail("INVALID", "Pick who should work on this request.");
  const ids = [...new Set(v as string[])];
  return ids.length > MAX_ASSIGNEE_CHANGE ? fail("INVALID", `Change at most ${MAX_ASSIGNEE_CHANGE} people at a time.`) : ids;
}

/** Why one of `ids` cannot be added (first offender, in order), or null. One query. */
async function cannotAssign(db: Pick<PrismaClient, "user">, ids: string[]): Promise<CollabFail | null> {
  if (ids.length === 0) return null;
  const found = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, active: true, appRole: true, jobRole: true } });
  const byId = new Map(found.map((u) => [u.id, u]));
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) return fail("NOT_FOUND", "Assignee not found.");
    if (!a.active) return fail("INVALID", "That person is no longer active.");
    if (a.appRole === "REQUESTER") return fail("INVALID", "Requesters cannot be assignees. Pick a creative, lead or admin.");
    // Same rule as listCreativeTeam (src/lib/team.ts): the creative team is the designers.
    if (a.jobRole !== "DESIGNER") return fail("INVALID", "Only creative team members can be assignees.");
  }
  return null;
}

/**
 * Applies one change to the request's assignees: adds the people in `add` and removes those in `remove`, against the
 * rows as they are when the change lands (not against what the caller last saw), so a stale tab never undoes someone
 * else's edit; for each person the last write wins. Leads and admins change any request; whoever filed it may too.
 * Only the people actually being added are checked (active, on the creative team): someone already assigned who has
 * since left stays until they are removed. Returns the effective change; added people get ASSIGNED, removed people
 * UNASSIGNED, both in-app only after the commit.
 */
export async function setAssigneesWith(
  db: PrismaClient,
  user: Actor,
  requestId: string,
  change: AssigneeChange,
  notifier: Notifier = notifierFor(db),
): Promise<{ ok: true; added: string[]; removed: string[] } | CollabFail> {
  if (typeof change !== "object" || change === null || Array.isArray(change)) return fail("INVALID", "Pick who should work on this request.");
  const add = changeIds(change.add);
  if (!Array.isArray(add)) return add;
  const remove = changeIds(change.remove);
  if (!Array.isArray(remove)) return remove;
  if (add.some((id) => remove.includes(id))) return fail("INVALID", "Add or remove a person, not both at once.");
  const req = await db.request.findUnique({ where: { id: requestId }, select: { status: true, requesterId: true, title: true } });
  // Leads and admins assign any request; whoever filed a request may pick its designers too.
  if (!can(user.appRole, "request.assign") && req?.requesterId !== user.id)
    return fail("FORBIDDEN", "Only the requester, leads and admins can assign this request.");
  if (!req) return fail("NOT_FOUND", "Request not found.");
  if (req.status === "CANCELLED") return fail("INVALID", "A cancelled request cannot be reassigned.");
  let added: string[], removed: string[];
  try {
    ({ added, removed } = await db.$transaction(async (tx) => {
      // Lock the request row first so concurrent changes queue up, then diff against the rows no one else can change
      // until we commit. A request cancelled since the read above rolls back.
      const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS status FROM "Request" WHERE "id" = ${requestId} FOR UPDATE`;
      if (locked.length === 0 || locked[0].status === "CANCELLED") throw new CancelledDuringAssign();
      const current = new Set((await tx.requestAssignee.findMany({ where: { requestId }, select: { userId: true } })).map((r) => r.userId));
      const added = add.filter((id) => !current.has(id));
      const removed = remove.filter((id) => current.has(id));
      const rejected = await cannotAssign(tx, added);
      if (rejected) throw new AssignRejected(rejected);
      if (removed.length) await tx.requestAssignee.deleteMany({ where: { requestId, userId: { in: removed } } });
      if (added.length) await tx.requestAssignee.createMany({ data: added.map((userId) => ({ requestId, userId })), skipDuplicates: true });
      return { added, removed };
    }));
  } catch (e) {
    if (e instanceof AssignRejected) return e.result;
    if (!(e instanceof CancelledDuringAssign)) throw e;
    const now = await db.request.findUnique({ where: { id: requestId }, select: { status: true } });
    return now ? fail("INVALID", "A cancelled request cannot be reassigned.") : fail("NOT_FOUND", "Request not found.");
  }
  const tell = (type: "ASSIGNED" | "UNASSIGNED", ids: string[], actorName: string) => {
    const to = ids.filter((id) => id !== user.id);
    return to.length ? notifier({ actorId: user.id, userIds: to, requestId, type, message: buildMessage(type, actorName, req.title) }) : Promise.resolve();
  };
  if (added.length || removed.length)
    await bestEffort(async () => {
      const actor = await db.user.findUnique({ where: { id: user.id }, select: { name: true } });
      const name = actor?.name ?? "Someone";
      await Promise.allSettled([tell("ASSIGNED", added, name), tell("UNASSIGNED", removed, name)]);
    });
  return { ok: true, added, removed };
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
  if (!isFileLocation(url)) return fail("INVALID", `${FILE_LOCATION_HINT}.`);
  if (!(await activeUser(db, user.id))) return fail("FORBIDDEN", "Your account is not active.");
  const req = await db.request.findUnique({ where: { id: requestId }, select: { title: true, requesterId: true, assignees: { select: { userId: true } } } });
  if (!req) return fail("NOT_FOUND", "Request not found.");
  const a = await db.attachment.create({ data: { requestId, uploaderId: user.id, name, url } });
  // In-app only: a burst of links should not flood anyone's email.
  const userIds = [...new Set([req.requesterId, ...req.assignees.map((a) => a.userId)])].filter((id) => id !== user.id);
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
