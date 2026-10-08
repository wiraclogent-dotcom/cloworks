"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import { addAttachmentWith, addCommentWith, assignRequestWith, removeAttachmentWith, setIncludeKpiWith, type CollabFail } from "@/lib/collab";
import type { SessionUser } from "@/lib/session-core";

/** Unauthenticated sessions come back as a result object (Next redacts thrown errors in production). */
function run<T>(fn: (user: SessionUser) => Promise<T | CollabFail>): Promise<T | CollabFail> {
  return withUser<T | CollabFail, CollabFail>(requireUser, fn, unauthResult);
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

export async function setIncludeKpi(requestId: string, value: boolean): Promise<{ ok: true } | CollabFail> {
  return run(async (u) => {
    const r = await setIncludeKpiWith(prisma, u, requestId, value);
    if (r.ok) {
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/team");
    }
    return r;
  });
}
