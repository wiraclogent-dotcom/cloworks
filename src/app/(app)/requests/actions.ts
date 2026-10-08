"use server";

import type { RequestStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { withUser, UNAUTH_MESSAGE } from "@/lib/actionUser";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { rescheduleRequestWith, type RescheduleResult } from "@/lib/reschedule";
import { extractValues, submitRequestWith, type SubmitState } from "@/lib/submitRequest";
import { moveRequestWith, type MoveResult } from "@/lib/transition-action";

/** Board/menu move. Expected failures return as data so the UI can show the server message. */
export async function moveRequest(
  requestId: string,
  to: RequestStatus,
  opts?: { outputCount?: number; designFolderUrl?: string },
): Promise<MoveResult> {
  return moveRequestWith(requireUser, prisma, requestId, to, opts);
}

/** Calendar drag / detail-page deadline change. Expected failures return as data. */
export async function rescheduleRequest(requestId: string, day: string): Promise<RescheduleResult> {
  const r = await rescheduleRequestWith(requireUser, prisma, requestId, day);
  if (r.ok) {
    revalidatePath("/requests");
    revalidatePath(`/requests/${requestId}`);
  }
  return r;
}

export type { SubmitState } from "@/lib/submitRequest";

/** Form-facing wrapper for useActionState: expected errors come back as data (production redacts thrown errors). */
export async function submitRequest(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  return withUser<SubmitState, SubmitState>(requireUser, async (user) => {
    const r = await submitRequestWith(prisma, user, fd);
    if (r.ok) redirect("/requests");
    return r;
  }, () => ({ ok: false, code: "UNAUTHENTICATED", message: UNAUTH_MESSAGE, values: extractValues(fd), nonce: crypto.randomUUID() }));
}
