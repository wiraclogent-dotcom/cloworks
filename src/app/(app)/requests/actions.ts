"use server";

import type { RequestStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { createRequestWith, type CreateRequestInput } from "@/lib/createRequest";
import { submitRequestWith, type SubmitState } from "@/lib/submitRequest";
import { moveRequestWith, runTransitionAction, type MoveResult } from "@/lib/transition-action";

export async function transitionRequest(
  requestId: string,
  to: RequestStatus,
  opts?: { outputCount?: number; designFolderUrl?: string },
): Promise<void> {
  await runTransitionAction(requireUser, prisma, requestId, to, opts);
}

/** Board/menu move. Expected failures return as data so the UI can show the server message. */
export async function moveRequest(
  requestId: string,
  to: RequestStatus,
  opts?: { outputCount?: number; designFolderUrl?: string },
): Promise<MoveResult> {
  return moveRequestWith(requireUser, prisma, requestId, to, opts);
}

export async function createRequest(input: CreateRequestInput): Promise<{ id: string }> {
  const user = await requireUser();
  return createRequestWith(prisma, user, input);
}

export type { SubmitState } from "@/lib/submitRequest";

/** Form-facing wrapper for useActionState: expected errors come back as data (production redacts thrown errors). */
export async function submitRequest(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const user = await requireUser();
  const r = await submitRequestWith(prisma, user, fd);
  if (r.ok) redirect("/requests");
  return r;
}
