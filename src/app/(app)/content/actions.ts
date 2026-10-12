"use server";

import { revalidatePath } from "next/cache";
import type { MediaType } from "@prisma/client";
import { dbFor, requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import type { ScopedDb } from "@/lib/db";
import type { SessionUser } from "@/lib/session-core";
import { ContentError, type ContentErrorCode } from "@/lib/content/errors";
import { canDraftContent } from "@/lib/content/permissions";
import {
  createChannelWith, updateChannelWith, moveChannelWith, deleteChannelWith, type ChannelInput,
} from "@/lib/content/channels";
import { cloudinaryConfig } from "@/lib/media/config";
import { signUpload, type SignedUpload } from "@/lib/media/sign";
import { cloudinaryClient } from "@/lib/media/client";
import { registerMediaWith, MediaError, type MediaErrorCode } from "@/lib/media/register";

export type ContentActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: ContentErrorCode | MediaErrorCode | "UNAUTHENTICATED"; message: string; fieldErrors?: Record<string, string> };

function failure(e: unknown): { ok: false; code: ContentErrorCode | MediaErrorCode; message: string; fieldErrors?: Record<string, string> } {
  if (e instanceof ContentError) return { ok: false, code: e.code, message: e.message, fieldErrors: e.fieldErrors };
  if (e instanceof MediaError) return { ok: false, code: e.code, message: e.message };
  throw e;
}

/** Shared wrapper: auth, scoped db, result-object errors (Next redacts thrown errors in production), revalidate. */
function run<T extends object>(fn: (db: ScopedDb, user: SessionUser) => Promise<T | void>): Promise<ContentActionResult<T>> {
  return withUser<ContentActionResult<T>, ContentActionResult<T>>(requireUser, async (user) => {
    try {
      const r = await fn(dbFor(user), user);
      revalidatePath("/content");
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

export async function registerUpload(publicId: string, type: MediaType): Promise<ContentActionResult<{ mediaId: string }>> {
  return run(async (db, u) => {
    if (!canDraftContent(u)) throw new ContentError("FORBIDDEN", "You are not allowed to upload content media.");
    if (type !== "IMAGE" && type !== "VIDEO") throw new ContentError("INVALID", "Unsupported media type.");
    const cfg = cloudinaryConfig();
    if (!cfg) throw new MediaError("NOT_CONFIGURED", "Media storage is not configured");
    const media = await registerMediaWith(db, cloudinaryClient(cfg), u, { publicId, type });
    return { mediaId: media.id };
  });
}
