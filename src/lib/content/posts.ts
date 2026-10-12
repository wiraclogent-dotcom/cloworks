import type { ContentFormat, ContentKind, ContentMediaRole, ContentStatus, ContentSurface } from "@prisma/client";
import type { ScopedDb } from "../db";
import { isRealDate } from "../createRequest";
import { resolveMentions } from "../collab";
import { canApproveContent, canDraftContent, type ContentActor } from "./permissions";
import { canDelete, isEditable, nextStatus } from "./workflow";
import { needsRenumber, positionBetween, renumber } from "./order";
import { ContentError } from "./errors";

export type PostPatch = Partial<{ format: ContentFormat; plannedAt: string | null; typeId: string | null; brief: string; caption: string }>;
export type PostMediaEntry = { mediaId: string; role: ContentMediaRole };

export const MAX_CONTENT_COMMENT = 2000;
export const MAX_BRIEF = 5000; // matches request notes
export const MAX_CAPTION = 2200; // Instagram's limit
const FORMATS: readonly ContentFormat[] = ["SINGLE", "CAROUSEL", "VIDEO"];

/** A Jakarta calendar day, stored as midnight Jakarta time (same as createRequestWith). */
const jakartaMidnight = (d: string) => new Date(`${d}T00:00:00+07:00`);

function assertDrafter(user: ContentActor) {
  if (!canDraftContent(user)) throw new ContentError("FORBIDDEN", "You are not allowed to draft content.");
}

async function loadPost(db: ScopedDb, id: string) {
  const post = await db.contentPost.findFirst({ where: { id }, include: { request: { select: { assigneeId: true } } } });
  if (!post) throw new ContentError("NOT_FOUND", "Post not found.");
  return post;
}

async function hasContentOf(db: ScopedDb, postId: string, brief: string | null): Promise<boolean> {
  if (brief?.trim()) return true;
  return (await db.contentPostMedia.count({ where: { postId, role: "MOCKUP" } })) >= 1;
}

export async function createPostWith(
  db: ScopedDb, user: ContentActor,
  input: { channelId: string; surface: ContentSurface; kind: ContentKind; publishedAt?: string },
): Promise<{ id: string }> {
  assertDrafter(user);
  if (!(await db.socialChannel.findFirst({ where: { id: input.channelId }, select: { id: true } }))) throw new ContentError("NOT_FOUND", "Channel not found.");
  if (input.kind === "PUBLISHED") {
    if (!input.publishedAt || !isRealDate(input.publishedAt)) {
      throw new ContentError("INVALID", "Pick the date it was published.", { publishedAt: "Pick the date it was published" });
    }
    const created = await db.contentPost.create({
      data: { channelId: input.channelId, surface: input.surface, kind: "PUBLISHED", position: 0, publishedAt: jakartaMidnight(input.publishedAt), authorId: user.id },
      select: { id: true },
    });
    return { id: created.id };
  }
  // New planned posts land at the top of their tab (top = highest position).
  const top = await db.contentPost.findFirst({
    where: { channelId: input.channelId, surface: input.surface, kind: "PLANNED" }, orderBy: { position: "desc" }, select: { position: true },
  });
  const created = await db.contentPost.create({
    data: { channelId: input.channelId, surface: input.surface, kind: "PLANNED", position: positionBetween(null, top?.position ?? null), authorId: user.id },
    select: { id: true },
  });
  return { id: created.id };
}

export async function updatePostWith(db: ScopedDb, user: ContentActor, id: string, patch: PostPatch): Promise<{ status: ContentStatus }> {
  assertDrafter(user);
  const post = await loadPost(db, id);
  if (!isEditable(post.status)) throw new ContentError("LOCKED", "This post can no longer be edited.");

  const fieldErrors: Record<string, string> = {};
  const data: Record<string, unknown> = {};
  if (patch.format !== undefined) {
    if (FORMATS.includes(patch.format)) data.format = patch.format;
    else fieldErrors.format = "Pick a valid format";
  }
  if (patch.plannedAt !== undefined) {
    if (patch.plannedAt === null) data.plannedAt = null;
    else if (typeof patch.plannedAt === "string" && isRealDate(patch.plannedAt)) data.plannedAt = jakartaMidnight(patch.plannedAt);
    else fieldErrors.plannedAt = "Enter a real date (YYYY-MM-DD)";
  }
  for (const [k, max] of [["brief", MAX_BRIEF], ["caption", MAX_CAPTION]] as const) {
    const v = patch[k];
    if (v === undefined) continue;
    if (typeof v !== "string") fieldErrors[k] = "Must be text";
    else if (v.length > max) fieldErrors[k] = `At most ${max} characters`;
  }
  if (Object.keys(fieldErrors).length) throw new ContentError("INVALID", Object.values(fieldErrors)[0], fieldErrors);
  if (patch.typeId !== undefined) {
    if (patch.typeId !== null && !(await db.requestType.findFirst({ where: { id: patch.typeId }, select: { id: true } }))) {
      throw new ContentError("NOT_FOUND", "Request type not found.");
    }
    data.typeId = patch.typeId;
  }
  if (patch.brief !== undefined) data.brief = patch.brief;
  if (patch.caption !== undefined) data.caption = patch.caption;

  const brief = patch.brief !== undefined ? patch.brief : post.brief;
  const hasContent = await hasContentOf(db, id, brief);
  const status = post.kind === "PUBLISHED" ? post.status : nextStatus(post.status, "save", { hasContent })!;
  const r = await db.contentPost.updateMany({ where: { id, status: post.status }, data: { ...data, status } });
  if (r.count !== 1) throw new ContentError("CONFLICT", "This post changed in the meantime. Reload and try again.");
  return { status };
}

/** Ids that no other post or channel avatar still points at (safe to destroy once unlinked from `postId`). */
async function orphanedMedia(db: ScopedDb, postId: string, mediaIds: string[]): Promise<string[]> {
  if (!mediaIds.length) return [];
  const rows = await db.media.findMany({
    where: { id: { in: mediaIds } },
    select: { id: true, postLinks: { where: { postId: { not: postId } }, select: { id: true } }, channels: { select: { id: true } } },
  });
  const used = new Set(rows.filter((m) => m.postLinks.length || m.channels.length).map((m) => m.id));
  return mediaIds.filter((m) => !used.has(m));
}

/**
 * Replaces the post's media for the role its status allows: MOCKUP while editable, FINAL in production or done.
 * Returns the ids that were unlinked and are now unused; the caller destroys them (Cloudinary + row).
 */
export async function setPostMediaWith(db: ScopedDb, user: ContentActor, id: string, media: PostMediaEntry[]): Promise<{ removedMediaIds: string[] }> {
  const post = await loadPost(db, id);
  const role: ContentMediaRole | null = isEditable(post.status) ? "MOCKUP" : post.status === "IN_PRODUCTION" || post.status === "DONE" ? "FINAL" : null;
  if (!role) throw new ContentError("LOCKED", "This post can no longer be edited.");
  if (media.some((m) => m.role !== role)) throw new ContentError("LOCKED", role === "MOCKUP" ? "Only mockups can be changed right now." : "Only final files can be changed right now.");
  const allowed = canDraftContent(user) || (role === "FINAL" && !!post.request && post.request.assigneeId === user.id);
  if (!allowed) throw new ContentError("FORBIDDEN", "You are not allowed to change this media.");

  const ids = media.map((m) => m.mediaId);
  if (new Set(ids).size !== ids.length) throw new ContentError("INVALID", "A file can only be added once.");
  if (ids.length && (await db.media.count({ where: { id: { in: ids } } })) !== ids.length) throw new ContentError("NOT_FOUND", "Media not found.");

  const existing = await db.contentPostMedia.findMany({ where: { postId: id }, orderBy: { order: "asc" }, select: { mediaId: true, role: true } });
  if (existing.some((l) => l.role !== role && ids.includes(l.mediaId))) throw new ContentError("INVALID", "That file is already attached to this post.");
  const previous = existing.filter((l) => l.role === role).map((l) => l.mediaId);

  // Status guard and link swap commit together, so a stale tab cannot touch a post that was submitted meanwhile.
  const hasContent = !!post.brief?.trim() || (role === "MOCKUP" ? media.length >= 1 : (await db.contentPostMedia.count({ where: { postId: id, role: "MOCKUP" } })) >= 1);
  const status = post.kind === "PUBLISHED" || role === "FINAL" ? post.status : nextStatus(post.status, "save", { hasContent })!;
  await db.$transaction(async (tx) => {
    const r = await tx.contentPost.updateMany({ where: { id, status: post.status }, data: { status } });
    if (r.count !== 1) throw new ContentError("CONFLICT", "This post changed in the meantime. Reload and try again.");
    await tx.contentPostMedia.deleteMany({ where: { postId: id, role } });
    await tx.contentPostMedia.createMany({ data: media.map((m, order) => ({ postId: id, mediaId: m.mediaId, role, order })) });
  });
  return { removedMediaIds: await orphanedMedia(db, id, previous.filter((m) => !ids.includes(m))) };
}

/** Drops a planned post between two neighbours of the same tab (either may be null at the ends). */
export async function movePostWith(db: ScopedDb, user: ContentActor, id: string, aboveId: string | null, belowId: string | null): Promise<void> {
  assertDrafter(user);
  const post = await loadPost(db, id);
  if (post.kind === "PUBLISHED") throw new ContentError("INVALID", "Published posts cannot be reordered.");
  if (!isEditable(post.status)) throw new ContentError("LOCKED", "This post can no longer be moved.");
  const tab = await db.contentPost.findMany({
    where: { channelId: post.channelId, surface: post.surface, kind: "PLANNED" }, orderBy: { position: "desc" }, select: { id: true, position: true },
  });
  const pos = (nid: string | null) => {
    if (nid === null) return null;
    const p = tab.find((x) => x.id === nid);
    if (!p || nid === id) throw new ContentError("NOT_FOUND", "Post not found.");
    return p.position;
  };
  const above = pos(aboveId);
  const below = pos(belowId);
  let moved = positionBetween(above, below);
  const others: { id: string; position: number }[] = [];
  if (needsRenumber(above, below)) {
    const ids = tab.map((p) => p.id).filter((x) => x !== id);
    ids.splice(aboveId ? ids.indexOf(aboveId) + 1 : 0, 0, id);
    for (const r of renumber(ids)) (r.id === id ? (moved = r.position) : others.push(r));
  }
  await db.$transaction(async (tx) => {
    const r = await tx.contentPost.updateMany({ where: { id, status: post.status }, data: { position: moved } });
    if (r.count !== 1) throw new ContentError("CONFLICT", "This post changed in the meantime. Reload and try again.");
    for (const o of others) await tx.contentPost.update({ where: { id: o.id }, data: { position: o.position } });
  });
}

/** Author or approver, before APPROVED. Returns media ids now unused; the caller destroys them. */
export async function deletePostWith(db: ScopedDb, user: ContentActor, id: string): Promise<{ mediaIds: string[] }> {
  const post = await loadPost(db, id);
  if (post.authorId !== user.id && !canApproveContent(user)) throw new ContentError("FORBIDDEN", "Only the author or a lead can delete this post.");
  if (!canDelete(post.status)) throw new ContentError("INVALID", "Approved posts cannot be deleted.");
  const links = await db.contentPostMedia.findMany({ where: { postId: id }, select: { mediaId: true } });
  const mediaIds = await orphanedMedia(db, id, links.map((l) => l.mediaId));
  const r = await db.contentPost.deleteMany({ where: { id, status: post.status } });
  if (r.count !== 1) throw new ContentError("CONFLICT", "This post changed in the meantime. Reload and try again.");
  return { mediaIds };
}

export async function submitPostWith(db: ScopedDb, user: ContentActor, id: string): Promise<void> {
  assertDrafter(user);
  const post = await loadPost(db, id);
  if (post.kind === "PUBLISHED") throw new ContentError("INVALID", "Published posts cannot be submitted.");
  if (!isEditable(post.status)) throw new ContentError("LOCKED", "This post was already submitted.");
  const fieldErrors: Record<string, string> = {};
  if (!post.brief?.trim()) fieldErrors.brief = "Write a brief before submitting";
  if (!post.plannedAt) fieldErrors.plannedAt = "Pick a planned date before submitting";
  if (Object.keys(fieldErrors).length) throw new ContentError("INVALID", Object.values(fieldErrors)[0], fieldErrors);
  const next = nextStatus(post.status, "submit");
  if (!next) throw new ContentError("INVALID", "Save the post as a draft before submitting.");
  const r = await db.contentPost.updateMany({ where: { id, status: post.status }, data: { status: next, submittedAt: new Date() } });
  if (r.count !== 1) throw new ContentError("CONFLICT", "This post changed in the meantime. Reload and try again.");
}

function cleanBody(raw: unknown, what: string, field: string): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new ContentError("INVALID", `Write ${what} first.`, { [field]: `Write ${what} first` });
  if (text.length > MAX_CONTENT_COMMENT) {
    throw new ContentError("INVALID", `At most ${MAX_CONTENT_COMMENT} characters.`, { [field]: `At most ${MAX_CONTENT_COMMENT} characters` });
  }
  return text;
}

export async function sendBackPostWith(db: ScopedDb, user: ContentActor, id: string, note: string): Promise<{ id: string }> {
  if (!canApproveContent(user)) throw new ContentError("FORBIDDEN", "Only a lead can send a post back.");
  const text = cleanBody(note, "a note for the author", "note");
  const post = await loadPost(db, id);
  const next = nextStatus(post.status, "sendBack");
  if (!next) throw new ContentError("CONFLICT", "This post is no longer waiting for review.");
  const c = await db.$transaction(async (tx) => {
    const r = await tx.contentPost.updateMany({ where: { id, status: post.status }, data: { status: next } });
    if (r.count !== 1) throw new ContentError("CONFLICT", "This post changed in the meantime. Reload and try again.");
    return tx.contentComment.create({ data: { postId: id, authorId: user.id, body: text, isFeedback: true }, select: { id: true } });
  });
  return { id: c.id };
}

/** Any member may comment in any status. Returns the mentioned user ids so the caller can notify them. */
export async function addContentCommentWith(db: ScopedDb, user: ContentActor, id: string, body: string): Promise<{ id: string; mentionedUserIds: string[] }> {
  const text = cleanBody(body, "a comment", "body");
  await loadPost(db, id);
  const mentionedUserIds = await resolveMentions(db, text, user.id);
  const c = await db.contentComment.create({ data: { postId: id, authorId: user.id, body: text }, select: { id: true } });
  return { id: c.id, mentionedUserIds };
}
