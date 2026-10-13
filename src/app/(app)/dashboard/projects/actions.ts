"use server";

import { revalidatePath } from "next/cache";
import { dbFor, requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import { addProjectTargetsWith, removeProjectTargetWith, type ProjectTargetResult } from "@/lib/kpi/projectTargets";

function revalidateKpi(userId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/team");
  revalidatePath(`/dashboard/projects/${userId}`);
}

/** Expected failures return as data (Next redacts thrown errors in production). */
export async function addProjectTargets(input: {
  userId: string;
  year: number;
  projectId: string;
  itemTitles: string[];
}): Promise<ProjectTargetResult> {
  return withUser<ProjectTargetResult, ProjectTargetResult>(requireUser, async (user) => {
    const r = await addProjectTargetsWith(dbFor(user), user, input);
    if (r.ok) revalidateKpi(input.userId);
    return r;
  }, unauthResult);
}

export async function removeProjectTarget(targetId: string): Promise<ProjectTargetResult> {
  return withUser<ProjectTargetResult, ProjectTargetResult>(requireUser, async (user) => {
    const r = await removeProjectTargetWith(dbFor(user), user, targetId);
    if (!r.ok) return r;
    revalidateKpi(r.userId);
    return { ok: true };
  }, unauthResult);
}
