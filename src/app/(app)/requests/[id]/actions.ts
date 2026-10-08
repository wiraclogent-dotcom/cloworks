"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { addAttachmentWith, addCommentWith, assignRequestWith, removeAttachmentWith, type CollabFail } from "@/lib/collab";

const UNAUTH: CollabFail = { ok: false, code: "FORBIDDEN", message: "Your session has expired. Sign in again." };

async function run<T>(fn: (user: Awaited<ReturnType<typeof requireUser>>) => Promise<T | CollabFail>): Promise<T | CollabFail> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return UNAUTH;
  }
  return fn(user);
}

export async function addComment(requestId: string, body: string): Promise<{ ok: true; mentionedUserIds: string[] } | CollabFail> {
  return run(async (u) => {
    const r = await addCommentWith(prisma, u, requestId, body);
    return r.ok ? { ok: true as const, mentionedUserIds: r.mentionedUserIds } : r;
  });
}

export async function assignRequest(requestId: string, assigneeId: string | null): Promise<{ ok: true } | CollabFail> {
  return run((u) => assignRequestWith(prisma, u, requestId, assigneeId));
}

export async function addAttachment(requestId: string, input: { name: string; url: string }): Promise<{ ok: true } | CollabFail> {
  return run(async (u) => {
    const r = await addAttachmentWith(prisma, u, requestId, input);
    return r.ok ? { ok: true as const } : r;
  });
}

export async function removeAttachment(requestId: string, attachmentId: string): Promise<{ ok: true } | CollabFail> {
  return run((u) => removeAttachmentWith(prisma, u, requestId, attachmentId));
}
