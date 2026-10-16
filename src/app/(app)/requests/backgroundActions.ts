"use server";

import { withUser } from "@/lib/actionUser";
import { dbFor, requireUser } from "@/lib/session";
import { clampVeil, isPresetId } from "@/lib/boardBackground";
import { cloudinaryConfig } from "@/lib/media/config";
import { cloudinaryClient } from "@/lib/media/client";
import { signUpload, type SignedUpload } from "@/lib/media/sign";
import { MediaError, registerMediaWith } from "@/lib/media/register";
import { destroyMediaWith } from "@/lib/media/destroy";
import { mediaUrl } from "@/lib/media/url";

/** Every signed-in person sets their own board background; nothing here touches anyone else's. */
export type BackgroundResult<T = object> = ({ ok: true } & T) | { ok: false; code: string; message: string };

const NOT_CONFIGURED = { ok: false, code: "NOT_CONFIGURED", message: "Picture uploads are not set up on this server." } as const;

/** Saves the choice and its veil. "custom" needs a picture already uploaded. */
export async function saveBoardBackground(input: { id: string; veil: number }): Promise<BackgroundResult> {
  return withUser(requireUser, async (me): Promise<BackgroundResult> => {
    const db = dbFor(me);
    if (input.id !== "custom" && !isPresetId(input.id)) return { ok: false, code: "INVALID", message: "Unknown background." };
    if (input.id === "custom") {
      const row = await db.user.findUnique({ where: { id: me.id }, select: { boardBackgroundMediaId: true } });
      if (!row?.boardBackgroundMediaId) return { ok: false, code: "INVALID", message: "Upload a picture first." };
    }
    await db.user.update({ where: { id: me.id }, data: { boardBackground: input.id, boardVeil: clampVeil(input.veil) } });
    return { ok: true };
  });
}

/** Signed direct upload into the workspace's board folder; the API secret never leaves the server. */
export async function requestBoardUploadSignature(): Promise<BackgroundResult<{ upload: SignedUpload }>> {
  return withUser(requireUser, async (me): Promise<BackgroundResult<{ upload: SignedUpload }>> => {
    const cfg = cloudinaryConfig();
    if (!cfg) return NOT_CONFIGURED;
    return { ok: true, upload: signUpload(cfg, me.workspaceId, "board", "image") };
  });
}

/**
 * Records the uploaded picture (size and format read back from Cloudinary), makes it this person's board background
 * and drops the picture it replaces. The veil starts at 0; the picker measures the picture and saves an AA veil.
 */
export async function registerBoardUpload(publicId: string): Promise<BackgroundResult<{ src: string }>> {
  return withUser(requireUser, async (me): Promise<BackgroundResult<{ src: string }>> => {
    const cfg = cloudinaryConfig();
    if (!cfg) return NOT_CONFIGURED;
    // Only a board-folder upload: the picture it replaces is deleted, so it must never be a content post's media.
    if (!publicId.startsWith(`clowork/${me.workspaceId}/board/`)) return { ok: false, code: "INVALID", message: "That file is not a board picture." };
    const db = dbFor(me);
    const client = cloudinaryClient(cfg);
    try {
      const media = await registerMediaWith(db, client, me, { publicId, type: "IMAGE" });
      const before = await db.user.findUnique({ where: { id: me.id }, select: { boardBackgroundMediaId: true } });
      await db.user.update({ where: { id: me.id }, data: { boardBackground: "custom", boardBackgroundMediaId: media.id, boardVeil: 0 } });
      if (before?.boardBackgroundMediaId && before.boardBackgroundMediaId !== media.id) await destroyMediaWith(db, client, before.boardBackgroundMediaId).catch(() => {});
      return { ok: true, src: mediaUrl(media, "full", cfg.cloudName) };
    } catch (e) {
      if (e instanceof MediaError) return { ok: false, code: e.code, message: e.message };
      throw e;
    }
  });
}

/** Removes the uploaded picture and goes back to the default preset. */
export async function removeBoardPicture(): Promise<BackgroundResult> {
  return withUser(requireUser, async (me): Promise<BackgroundResult> => {
    const db = dbFor(me);
    const row = await db.user.findUnique({ where: { id: me.id }, select: { boardBackgroundMediaId: true } });
    await db.user.update({ where: { id: me.id }, data: { boardBackground: "gradient", boardBackgroundMediaId: null, boardVeil: null } });
    const cfg = cloudinaryConfig();
    if (row?.boardBackgroundMediaId && cfg) await destroyMediaWith(db, cloudinaryClient(cfg), row.boardBackgroundMediaId).catch(() => {});
    return { ok: true };
  });
}
