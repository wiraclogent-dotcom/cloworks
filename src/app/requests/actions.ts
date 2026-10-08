"use server";

import type { RequestStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { runTransitionAction } from "@/lib/transition-action";

export async function transitionRequest(
  requestId: string,
  to: RequestStatus,
  opts?: { outputCount?: number; designFolderUrl?: string },
): Promise<void> {
  await runTransitionAction(requireUser, prisma, requestId, to, opts);
}
