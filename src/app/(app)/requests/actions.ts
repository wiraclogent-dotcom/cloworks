"use server";

import type { RequestStatus } from "@prisma/client";
import { dbFor, requireUser } from "@/lib/session";
import { withUser, UNAUTH_MESSAGE, unauthResult } from "@/lib/actionUser";
import { redirect } from "next/navigation";
import { rescheduleRequestWith, type RescheduleResult } from "@/lib/reschedule";
import { extractValues, submitRequestWith, type SubmitState } from "@/lib/submitRequest";
import { moveRequestWith, type MoveResult } from "@/lib/transition-action";

/** Board/menu move. Expected failures return as data so the UI can show the server message. */
export async function moveRequest(
  requestId: string,
  to: RequestStatus,
  opts?: { outputCount?: number; designFolderUrl?: string },
): Promise<MoveResult> {
  return withUser<MoveResult, MoveResult>(requireUser, (user) => moveRequestWith(async () => user, dbFor(user), requestId, to, opts), unauthResult);
}

/** Calendar drag / detail-page deadline change. Expected failures return as data. */
// No revalidatePath: both callers (calendar drag, detail form) call router.refresh() on success, and revalidating
// here as well made Next render the page twice per change.
export async function rescheduleRequest(requestId: string, day: string): Promise<RescheduleResult> {
  return withUser<RescheduleResult, RescheduleResult>(
    requireUser,
    (user) => rescheduleRequestWith(async () => user, dbFor(user), requestId, day),
    unauthResult,
  );
}

export type { SubmitState } from "@/lib/submitRequest";

/** Form-facing wrapper for useActionState: expected errors come back as data (production redacts thrown errors). */
export async function submitRequest(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  return withUser<SubmitState, SubmitState>(requireUser, async (user) => {
    const db = dbFor(user);
    const r = await submitRequestWith(db, user, fd);
    if (r.ok) redirect("/requests");
    return r;
  }, () => ({ ok: false, code: "UNAUTHENTICATED", message: UNAUTH_MESSAGE, values: extractValues(fd), nonce: crypto.randomUUID() }));
}
