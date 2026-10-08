"use server";

import { revalidatePath } from "next/cache";
import type { JobRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { setTargetWith, type SetTargetResult } from "@/lib/kpi/targets";

/** Expected failures return as data (Next redacts thrown errors in production). */
export async function setTarget(
  userId: string,
  month: string,
  role: JobRole,
  targetTasks: number,
  note?: string,
): Promise<SetTargetResult> {
  const user = await requireUser();
  const r = await setTargetWith(prisma, user, { userId, month, role, targetTasks, note });
  if (r.ok) {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/team");
  }
  return r;
}
