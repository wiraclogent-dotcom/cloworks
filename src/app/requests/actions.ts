"use server";

import type { RequestStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { createRequestWith, CreateRequestError, type CreateRequestInput } from "@/lib/createRequest";
import { fieldsFromFormData, parseFieldSchema } from "@/lib/fieldSchema";
import { runTransitionAction } from "@/lib/transition-action";

export async function transitionRequest(
  requestId: string,
  to: RequestStatus,
  opts?: { outputCount?: number; designFolderUrl?: string },
): Promise<void> {
  await runTransitionAction(requireUser, prisma, requestId, to, opts);
}

export async function createRequest(input: CreateRequestInput): Promise<{ id: string }> {
  const user = await requireUser();
  return createRequestWith(prisma, user, input);
}

export type SubmitState = { ok: false; code?: string; message: string; fieldErrors?: Record<string, string> } | null;

/** Form-facing wrapper for useActionState: expected errors come back as data (production redacts thrown errors). */
export async function submitRequest(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const user = await requireUser();
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" ? v : "";
  };
  const typeId = str("typeId");
  const type = typeId ? await prisma.requestType.findUnique({ where: { id: typeId }, select: { fieldSchema: true } }) : null;
  const input: CreateRequestInput = {
    title: str("title"),
    briefUrl: str("briefUrl"),
    notes: str("notes"),
    brandId: str("brandId"),
    divisionId: str("divisionId"),
    typeId,
    deadline: str("deadline") || null,
    fields: type ? fieldsFromFormData(parseFieldSchema(type.fieldSchema), fd) : {},
  };
  try {
    await createRequestWith(prisma, user, input);
  } catch (e) {
    if (e instanceof CreateRequestError) return { ok: false, code: e.code, message: e.message, fieldErrors: e.fieldErrors };
    throw e;
  }
  redirect("/requests");
}
