import type { PrismaClient } from "@prisma/client";

/** What the bell and the notifications page show for one row. */
export type InboxItem = { id: string; type: string; message: string; requestId: string | null; readAt: Date | null; createdAt: Date };

type Db = Pick<PrismaClient, "notification">;
const SELECT = { id: true, type: true, message: true, requestId: true, readAt: true, createdAt: true } as const;

/** Every query here is confined to `userId`: nobody reads or marks someone else's notifications. */
export function listNotificationsWith(db: Db, userId: string, opts: { limit?: number; offset?: number } = {}): Promise<InboxItem[]> {
  return db.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit ?? 20,
    skip: opts.offset ?? 0,
    select: SELECT,
  });
}

export function countNotificationsWith(db: Db, userId: string): Promise<number> {
  return db.notification.count({ where: { userId } });
}

export function unreadCountWith(db: Db, userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

/** Someone else's id, or an already-read one, matches no rows and is a silent no-op. */
export async function markReadWith(db: Db, userId: string, id: string, now: Date = new Date()): Promise<void> {
  await db.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: now } });
}

export async function markAllReadWith(db: Db, userId: string, now: Date = new Date()): Promise<void> {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: now } });
}
