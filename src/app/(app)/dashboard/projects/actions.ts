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
    const db = dbFor(user);
    // Read the owner first so the right person page is revalidated; the lib function still does the permission check.
    const t = typeof targetId === "string" && targetId ? await db.projectKpiTarget.findFirst({ where: { id: targetId }, select: { userId: true } }) : null;
    const r = await removeProjectTargetWith(db, user, targetId);
    if (r.ok) revalidateKpi(t?.userId ?? "");
    return r;
  }, unauthResult);
}
