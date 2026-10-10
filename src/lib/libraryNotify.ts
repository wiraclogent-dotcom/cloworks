import type { ScopedDb } from "./db";
import { LIBRARY_NOTIFICATION } from "./notificationLinks";
import { cleanLine } from "./notify";

export { LIBRARY_NOTIFICATION };

/**
 * Tells every active member of the workspace except the actor that a Library link was added or its content changed.
 * In-app (bell) only, never email: a Library edit is not urgent enough to mail the whole team. Bulk imports
 * (scripts/seed-library.ts) go through the cores directly and never call this.
 */
export async function notifyLibraryWith(db: ScopedDb, actorId: string, kind: "added" | "updated", title: string): Promise<void> {
  const [actor, users] = await Promise.all([
    db.user.findUnique({ where: { id: actorId }, select: { name: true } }),
    db.user.findMany({ where: { active: true, id: { not: actorId } }, select: { id: true } }),
  ]);
  if (users.length === 0) return;
  const who = cleanLine(actor?.name ?? "Someone", 80);
  const t = cleanLine(title, 120);
  const message = kind === "added" ? `${who} added “${t}” to the Library` : `${who} updated “${t}” in the Library`;
  await db.notification.createMany({ data: users.map((u) => ({ userId: u.id, type: LIBRARY_NOTIFICATION, message })) });
}
