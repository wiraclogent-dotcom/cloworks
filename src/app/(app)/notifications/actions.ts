"use server";

import { revalidatePath } from "next/cache";
import { dbFor, requireUser, type ScopedDb } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import type { CollabFail } from "@/lib/collab";
import { listNotificationsWith, markAllReadWith, markReadWith, unreadCountWith, type InboxItem } from "@/lib/inbox";
import type { SessionUser } from "@/lib/session-core";

function run<T>(fn: (user: SessionUser, db: ScopedDb) => Promise<T>): Promise<T | CollabFail> {
  return withUser<T | CollabFail, CollabFail>(requireUser, (user) => fn(user, dbFor(user)), unauthResult);
}

/** The bell's dropdown: the newest 20 plus the fresh unread count. */
export async function listNotifications(): Promise<{ ok: true; items: InboxItem[]; unread: number } | CollabFail> {
  return run(async (u, db) => {
    const [items, unread] = await Promise.all([listNotificationsWith(db, u.id), unreadCountWith(db, u.id)]);
    return { ok: true as const, items, unread };
  });
}

export async function markNotificationRead(id: string): Promise<{ ok: true } | CollabFail> {
  return run(async (u, db) => {
    if (typeof id !== "string" || !id) return { ok: false as const, code: "INVALID" as const, message: "Unknown notification." };
    await markReadWith(db, u.id, id);
    revalidatePath("/notifications");
    return { ok: true as const };
  });
}

export async function markAllNotificationsRead(): Promise<{ ok: true } | CollabFail> {
  return run(async (u, db) => {
    await markAllReadWith(db, u.id);
    revalidatePath("/notifications");
    return { ok: true as const };
  });
}
