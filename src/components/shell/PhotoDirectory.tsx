import { requireScope } from "@/lib/session";
import { photoUrl } from "@/lib/profilePhotoUrl";
import { PhotoDirectorySync } from "./PhotoDirectorySync";

/** Server half of the photo directory: who in this workspace has a profile photo, and its versioned URL. */
export async function PhotoDirectory() {
  const { db } = await requireScope();
  const people = await db.user.findMany({
    where: { avatarUpdatedAt: { not: null } },
    select: { id: true, name: true, fullName: true, avatarUpdatedAt: true },
  });
  const entries = people.map((p) => ({ names: [p.name, p.fullName], src: photoUrl(p.id, p.avatarUpdatedAt!) }));
  return <PhotoDirectorySync entries={entries} />;
}
