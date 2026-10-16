"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ContentKind, ContentStatus, ContentSurface, MediaType } from "@prisma/client";
import { bestEffort, buildMessage, notifierFor, realMailer } from "@/lib/notify";
import { commentRecipients, notifyContentWith, type ContentNotice } from "@/lib/content/notify";
import { dbFor, requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import type { ScopedDb } from "@/lib/db";
import type { SessionUser } from "@/lib/session-core";
import { ContentError, type ContentErrorCode } from "@/lib/content/errors";
import { canDraftContent } from "@/lib/content/permissions";
import {
  createChannelWith, updateChannelWith, moveChannelWith, deleteChannelWith, type ChannelInput,
} from "@/lib/content/channels";
import {
  createPostWith, updatePostWith, setPostMediaWith, movePostWith, deletePostWith, submitPostWith, sendBackPostWith,
  addContentCommentWith, type PostPatch, type PostMediaEntry,
} from "@/lib/content/posts";
import { approveContentPostWith, loadApproveForm, type ApproveInput, type ApproveFormData } from "@/lib/content/approve";
import { CreateRequestError } from "@/lib/createRequest";
import { cloudinaryConfig } from "@/lib/media/config";
import { signUpload, type SignedUpload } from "@/lib/media/sign";
import { cloudinaryClient } from "@/lib/media/client";
import { mediaUrl } from "@/lib/media/url";
import { destroyMediaWith } from "@/lib/media/destroy";
import { registerMediaWith, MediaError, type MediaErrorCode } from "@/lib/media/register";

export type ContentActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: ContentErrorCode | MediaErrorCode | "UNAUTHENTICATED"; message: string; fieldErrors?: Record<string, string> };

function failure(e: unknown): { ok: false; code: ContentErrorCode | MediaErrorCode; message: string; fieldErrors?: Record<string, string> } {
  if (e instanceof ContentError) return { ok: false, code: e.code, message: e.message, fieldErrors: e.fieldErrors };
  if (e instanceof MediaError) return { ok: false, code: e.code, message: e.message };
  if (e instanceof CreateRequestError) {
    return e.code === "FORBIDDEN"
      ? { ok: false, code: "FORBIDDEN", message: e.message }
      : { ok: false, code: "INVALID", message: e.message, fieldErrors: e.fieldErrors };
  }
  throw e;
}

/** Shared wrapper: auth, scoped db, result-object errors (Next redacts thrown errors in production), revalidate. */
function run<T extends object>(fn: (db: ScopedDb, user: SessionUser) => Promise<T | void>, opts: { revalidate?: boolean } = {}): Promise<ContentActionResult<T>> {
  return withUser<ContentActionResult<T>, ContentActionResult<T>>(requireUser, async (user) => {
    try {
      const r = await fn(dbFor(user), user);
      if (opts.revalidate !== false) revalidatePath("/content");
      return { ok: true, ...(r ?? {}) } as ContentActionResult<T>;
    } catch (e) {
      return failure(e);
    }
  }, unauthResult);
}

export async function createChannel(input: ChannelInput): Promise<ContentActionResult<{ id: string }>> {
  return run((db, u) => createChannelWith(db, u, input));
}
export async function updateChannel(id: string, input: ChannelInput): Promise<ContentActionResult> {
  return run((db, u) => updateChannelWith(db, u, id, input));
}
export async function moveChannel(id: string, aboveId: string | null, belowId: string | null): Promise<ContentActionResult> {
  return run((db, u) => moveChannelWith(db, u, id, aboveId, belowId));
}
export async function deleteChannel(id: string): Promise<ContentActionResult> {
  return run((db, u) => deleteChannelWith(db, u, id));
}

/** Destroys unlinked media after the response; skipped when storage is not configured (rows stay, nothing leaks). */
function destroyAfter(db: ScopedDb, mediaIds: string[]) {
  const cfg = cloudinaryConfig();
  if (!cfg || !mediaIds.length) return;
  const client = cloudinaryClient(cfg);
  for (const id of mediaIds) after(() => bestEffort(() => destroyMediaWith(db, client, id)));
}

/** Tells the people a content event concerns, after the response; failures are logged, never surfaced. */
function notifyAfter(db: ScopedDb, n: ContentNotice) {
  after(() => bestEffort(() => notifyContentWith(db, realMailer(), n)));
}

export async function createPost(input: { channelId: string; surface: ContentSurface; kind: ContentKind; publishedAt?: string }): Promise<ContentActionResult<{ id: string }>> {
  return run((db, u) => createPostWith(db, u, input));
}
export async function updatePost(id: string, patch: PostPatch): Promise<ContentActionResult<{ status: ContentStatus }>> {
  return run((db, u) => updatePostWith(db, u, id, patch));
}
export async function setPostMedia(id: string, media: PostMediaEntry[]): Promise<ContentActionResult> {
  return run(async (db, u) => {
    const { removedMediaIds } = await setPostMediaWith(db, u, id, media);
    destroyAfter(db, removedMediaIds);
  });
}
export async function movePost(id: string, aboveId: string | null, belowId: string | null): Promise<ContentActionResult> {
  return run((db, u) => movePostWith(db, u, id, aboveId, belowId));
}
export async function deletePost(id: string): Promise<ContentActionResult> {
  return run(async (db, u) => {
    const { mediaIds } = await deletePostWith(db, u, id);
    destroyAfter(db, mediaIds);
  });
}
export async function submitPost(id: string): Promise<ContentActionResult> {
  return run(async (db, u) => {
    await submitPostWith(db, u, id);
    notifyAfter(db, { kind: "submitted", postId: id, actorId: u.id });
  });
}
export async function sendBackPost(id: string, note: string): Promise<ContentActionResult> {
  return run(async (db, u) => {
    await sendBackPostWith(db, u, id, note);
    notifyAfter(db, { kind: "sentBack", postId: id, actorId: u.id, note });
  });
}
export async function loadApprove(id: string): Promise<ContentActionResult<{ form: ApproveFormData }>> {
  return run(async (db, u) => ({ form: await loadApproveForm(db, u, id) }), { revalidate: false });
}
export async function approvePost(id: string, input: ApproveInput): Promise<ContentActionResult<{ requestId: string }>> {
  return run(async (db, u) => {
    const { requestId } = await approveContentPostWith(db, u, id, input);
    notifyAfter(db, { kind: "approved", postId: id, actorId: u.id });
    // An assignee picked on the approve form is told just like when a lead assigns a request.
    const toTell = [...new Set(input.assigneeIds ?? [])].filter((a) => a && a !== u.id);
    if (toTell.length) {
      await bestEffort(async () => {
        const actor = await db.user.findUnique({ where: { id: u.id }, select: { name: true } });
        await notifierFor(db)({
          actorId: u.id, userIds: toTell, requestId, type: "ASSIGNED",
          message: buildMessage("ASSIGNED", actor?.name ?? "Someone", input.title),
        });
      });
    }
    return { requestId };
  });
}
export async function addContentComment(id: string, body: string): Promise<ContentActionResult<{ commentId: string }>> {
  return run(async (db, u) => {
    const { id: commentId, mentionedUserIds } = await addContentCommentWith(db, u, id, body);
    after(() => bestEffort(async () => {
      const userIds = await commentRecipients(db, id, u.id, mentionedUserIds);
      await notifyContentWith(db, realMailer(), { kind: "comment", postId: id, actorId: u.id, userIds });
    }));
    return { commentId };
  });
}

/** Signed direct-upload parameters for the browser. Only `content` uploads for now; the API secret never leaves the server. */
export async function requestUploadSignature(purpose: "content", kind: "image" | "video"): Promise<ContentActionResult<{ upload: SignedUpload }>> {
  return run(async (_db, u) => {
    if (!canDraftContent(u)) throw new ContentError("FORBIDDEN", "You are not allowed to upload content media.");
    if (purpose !== "content" || (kind !== "image" && kind !== "video")) throw new ContentError("INVALID", "Unsupported upload.");
    const cfg = cloudinaryConfig();
    if (!cfg) throw new MediaError("NOT_CONFIGURED", "Media storage is not configured");
    return { upload: signUpload(cfg, u.workspaceId, purpose, kind) };
  });
}

export async function registerUpload(publicId: string, type: MediaType): Promise<ContentActionResult<{ mediaId: string; previewUrl: string }>> {
  return run(async (db, u) => {
    if (!canDraftContent(u)) throw new ContentError("FORBIDDEN", "You are not allowed to upload content media.");
    if (type !== "IMAGE" && type !== "VIDEO") throw new ContentError("INVALID", "Unsupported media type.");
    const cfg = cloudinaryConfig();
    if (!cfg) throw new MediaError("NOT_CONFIGURED", "Media storage is not configured");
    const media = await registerMediaWith(db, cloudinaryClient(cfg), u, { publicId, type });
    // Same preview the panel uses: a sized image, or a video's first frame.
    return { mediaId: media.id, previewUrl: mediaUrl(media, media.type === "VIDEO" ? "poster" : "panel", cfg.cloudName) };
  });
}
