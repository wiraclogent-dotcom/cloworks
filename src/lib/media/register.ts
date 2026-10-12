import type { Media, MediaType } from "@prisma/client";
import type { ScopedDb } from "../db";
import type { CloudinaryClient } from "./client";
import { ALLOWED_FORMATS, IMAGE_FORMATS, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, VIDEO_FORMATS } from "./config";

export type MediaErrorCode = "NOT_CONFIGURED" | "INVALID" | "TOO_LARGE" | "NOT_FOUND";
export class MediaError extends Error {
  constructor(public code: MediaErrorCode, message: string) {
    super(message);
    this.name = "MediaError";
  }
}

/**
 * Records an uploaded asset. The client only names the public_id; size, dimensions and duration are read back
 * from Cloudinary, so they cannot be spoofed, and the id must sit inside the caller's own workspace folder.
 */
export async function registerMediaWith(
  db: ScopedDb, client: CloudinaryClient, user: { id: string; workspaceId: string }, input: { publicId: string; type: MediaType },
): Promise<Media> {
  if (!input.publicId.startsWith(`clowork/${user.workspaceId}/`)) throw new MediaError("INVALID", "That file does not belong to this workspace.");
  const res = await client.getResource(input.publicId, input.type);
  if (!res) throw new MediaError("NOT_FOUND", "The uploaded file was not found.");
  if (!(ALLOWED_FORMATS as readonly string[]).includes(res.format)) throw new MediaError("INVALID", "That file format is not supported.");
  const formats: readonly string[] = input.type === "VIDEO" ? VIDEO_FORMATS : IMAGE_FORMATS;
  if (!formats.includes(res.format)) throw new MediaError("INVALID", "The file does not match the expected type.");
  if (input.type === "IMAGE" && res.bytes > MAX_IMAGE_BYTES) throw new MediaError("TOO_LARGE", "Images can be at most 10 MB.");
  if (input.type === "VIDEO") {
    if (res.bytes > MAX_VIDEO_BYTES) throw new MediaError("TOO_LARGE", "Videos can be at most 100 MB.");
    if ((res.duration ?? 0) > MAX_VIDEO_SECONDS) throw new MediaError("TOO_LARGE", "Videos can be at most 90 seconds.");
  }
  return db.media.create({
    data: {
      publicId: input.publicId, type: input.type, width: res.width, height: res.height, bytes: res.bytes,
      durationSec: input.type === "VIDEO" ? (res.duration ?? null) : null, uploadedById: user.id,
    },
  });
}
