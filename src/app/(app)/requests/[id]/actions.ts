"use server";

import { revalidatePath } from "next/cache";
import { dbFor, requireUser, type ScopedDb } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import { addAttachmentWith, addCommentWith, assignRequestWith, removeAttachmentWith, setIncludeKpiWith, setNeedsMotionWith, type CollabFail } from "@/lib/collab";
import type { SessionUser } from "@/lib/session-core";

/**
 * Unauthenticated sessions come back as a result object (Next redacts thrown errors in production). `fn` gets the
 * client scoped to the user's workspace.
 */
function run<T>(fn: (user: SessionUser, db: ScopedDb) => Promise<T | CollabFail>): Promise<T | CollabFail> {
  return withUser<T | CollabFail, CollabFail>(requireUser, (user) => fn(user, dbFor(user)), unauthResult);
}

export async function addComment(requestId: string, body: string): Promise<{ ok: true; mentionedUserIds: string[] } | CollabFail> {
  return run(async (u, db) => {
    const r = await addCommentWith(db, u, requestId, body);
    return r.ok ? { ok: true as const, mentionedUserIds: r.mentionedUserIds } : r;
  });
}

export async function assignRequest(requestId: string, assigneeId: string | null): Promise<{ ok: true } | CollabFail> {
  return run((u, db) => assignRequestWith(db, u, requestId, assigneeId));
}

export async function addAttachment(requestId: string, input: { name: string; url: string }): Promise<{ ok: true } | CollabFail> {
  return run(async (u, db) => {
    const r = await addAttachmentWith(db, u, requestId, input);
    return r.ok ? { ok: true as const } : r;
  });
}

export async function removeAttachment(requestId: string, attachmentId: string): Promise<{ ok: true } | CollabFail> {
  return run((u, db) => removeAttachmentWith(db, u, requestId, attachmentId));
}

export async function setIncludeKpi(requestId: string, value: boolean): Promise<{ ok: true } | CollabFail> {
  return run(async (u, db) => {
    const r = await setIncludeKpiWith(db, u, requestId, value);
    if (r.ok) {
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/team");
    }
    return r;
  });
}

export async function setNeedsMotion(requestId: string, value: boolean): Promise<{ ok: true } | CollabFail> {
  return run(async (u, db) => {
    const r = await setNeedsMotionWith(db, u, requestId, value);
    if (r.ok) revalidatePath("/requests");
    return r;
  });
}
