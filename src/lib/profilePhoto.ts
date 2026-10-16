import type { PrismaClient } from "@prisma/client";

/** Largest stored photo. The browser resizes to 256px first, so real uploads are far below this. */
export const MAX_PHOTO_BYTES = 300_000;

export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

export class PhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoError";
  }
}

/** Recognises JPEG, PNG and WebP by their first bytes. Anything else (SVG, HTML, GIF, text) is refused. */
export function sniffPhotoType(b: Uint8Array): PhotoType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

type Db = Pick<PrismaClient, "user">;

/** Stores the photo on the person's own row. Refuses empty, oversized and non-image bytes before writing. */
export async function setProfilePhoto(db: Db, userId: string, bytes: Uint8Array, now: Date = new Date()): Promise<void> {
  if (bytes.byteLength === 0) throw new PhotoError("Choose a picture first.");
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new PhotoError("That picture is too large. Choose a smaller one.");
  const type = sniffPhotoType(bytes);
  if (!type) throw new PhotoError("Use a JPEG, PNG or WebP picture.");
  await db.user.update({ where: { id: userId }, data: { avatar: Buffer.from(bytes), avatarType: type, avatarUpdatedAt: now } });
}

export async function removeProfilePhoto(db: Db, userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { avatar: null, avatarType: null, avatarUpdatedAt: null } });
}

/** The stored photo, or null when there is none (or the id is not in this scope). */
export async function loadProfilePhoto(db: Db, userId: string): Promise<{ bytes: Uint8Array; type: PhotoType } | null> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { avatar: true, avatarType: true } });
  if (!u?.avatar || !u.avatarType) return null;
  return { bytes: u.avatar, type: u.avatarType as PhotoType };
}
