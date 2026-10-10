"use server";

import { revalidatePath } from "next/cache";
import type { JobRole } from "@prisma/client";
import { dbFor, requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import { setTargetWith, type SetTargetResult } from "@/lib/kpi/targets";

/** Expected failures return as data (Next redacts thrown errors in production). */
export async function setTarget(
  userId: string,
  month: string,
  role: JobRole,
  targetTasks: number,
  note?: string,
): Promise<SetTargetResult> {
  return withUser<SetTargetResult, SetTargetResult>(requireUser, async (user) => {
    const db = dbFor(user);
    const r = await setTargetWith(db, user, { userId, month, role, targetTasks, note });
    if (r.ok) {
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/team");
    }
    return r;
  }, unauthResult);
}
