import type { ScopedDb } from "../db";
import type { CloudinaryClient } from "./client";
import { MediaError } from "./register";

/** Deletes the row; the Cloudinary call is best effort (an orphaned asset is cheaper than a stuck row). */
export async function destroyMediaWith(db: ScopedDb, client: CloudinaryClient, mediaId: string): Promise<void> {
  const media = await db.media.findFirst({ where: { id: mediaId } });
  if (!media) throw new MediaError("NOT_FOUND", "Media not found.");
  try {
    await client.destroy(media.publicId, media.type);
  } catch (e) {
    console.error("[media] Cloudinary destroy failed:", e instanceof Error ? e.message : "unknown error");
  }
  await db.media.delete({ where: { id: media.id } });
}
