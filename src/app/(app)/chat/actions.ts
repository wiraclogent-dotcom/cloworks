"use server";

import { revalidatePath } from "next/cache";
import { dbFor, requireUser, type ScopedDb } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import { addCommentWith, type CollabFail } from "@/lib/collab";
import { chatUnreadCountWith, latestUnreadChatWith, listChatsWith, listMessagesWith, markChatReadWith, type ChatMessage, type ChatSummary } from "@/lib/chat";
import type { SessionUser } from "@/lib/session-core";

function run<T>(fn: (user: SessionUser, db: ScopedDb) => Promise<T>): Promise<T | CollabFail> {
  return withUser<T | CollabFail, CollabFail>(requireUser, (user) => fn(user, dbFor(user)), unauthResult);
}

type Cursor = { at: Date; id: string };

/** A usable compound cursor, or undefined (invalid cursors are ignored). */
function cursor(c: unknown): Cursor | undefined {
  if (!c || typeof c !== "object") return undefined;
  const { at, id } = c as { at?: unknown; id?: unknown };
  if (!(at instanceof Date) || Number.isNaN(at.getTime()) || typeof id !== "string" || !id) return undefined;
  return { at, id };
}

const invalid = (message: string) => ({ ok: false as const, code: "INVALID" as const, message });

export async function chatUnreadCount(): Promise<
  { ok: true; unread: number; latestUnread: { requestId: string; title: string } | null } | CollabFail
> {
  return run(async (u, db) => {
    const me = { id: u.id, workspaceId: u.workspaceId };
    const [unread, latestUnread] = await Promise.all([chatUnreadCountWith(db, me), latestUnreadChatWith(db, me)]);
    return { ok: true as const, unread, latestUnread };
  });
}

export async function listChats(offset?: number): Promise<{ ok: true; chats: ChatSummary[] } | CollabFail> {
  return run(async (u, db) => {
    const off = typeof offset === "number" && Number.isInteger(offset) && offset > 0 ? offset : 0;
    return { ok: true as const, chats: await listChatsWith(db, u.id, { offset: off }) };
  });
}

export async function listMessages(
  requestId: string,
  opts?: { after?: { at: Date; id: string }; before?: { at: Date; id: string } },
): Promise<{ ok: true; messages: ChatMessage[]; hasOlder: boolean } | CollabFail> {
  return run(async (u, db) => {
    if (typeof requestId !== "string" || !requestId) return invalid("Unknown request.");
    return listMessagesWith(db, u.id, requestId, { after: cursor(opts?.after), before: cursor(opts?.before) });
  });
}

export async function markChatRead(requestId: string): Promise<{ ok: true } | CollabFail> {
  return run(async (u, db) => {
    if (typeof requestId !== "string" || !requestId) return invalid("Unknown request.");
    await markChatReadWith(db, u.id, requestId);
    return { ok: true as const };
  });
}

export async function sendChatMessage(requestId: string, body: string): Promise<{ ok: true; message: ChatMessage } | CollabFail> {
  return run(async (u, db) => {
    if (typeof requestId !== "string" || !requestId) return invalid("Unknown request.");
    const r = await addCommentWith(db, u, requestId, body);
    if (!r.ok) return r;
    const row = await db.comment.findUnique({
      where: { id: r.commentId },
      select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } },
    });
    if (!row) return { ok: false as const, code: "NOT_FOUND" as const, message: "Message not found." };
    await markChatReadWith(db, u.id, requestId, row.createdAt);
    revalidatePath(`/requests/${requestId}`);
    return { ok: true as const, message: row };
  });
}
