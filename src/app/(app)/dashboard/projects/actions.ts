"use server";

import { revalidatePath } from "next/cache";
import { dbFor, requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import { can } from "@/lib/permissions";
import { itemOptions } from "@/lib/kpi/projectQueries";
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

export type ItemOption = { itemTitle: string; assignedTo: { userId: string; name: string }[] };
export type ItemOptionsResult = { ok: true; options: ItemOption[] } | Exclude<ProjectTargetResult, { ok: true }>;

/** The picker's checklist for one project and year. Only people who can manage targets get it. */
export async function loadItemOptions(projectId: string, year: number): Promise<ItemOptionsResult> {
  return withUser<ItemOptionsResult, ItemOptionsResult>(requireUser, async (user) => {
    if (!can(user.appRole, "dashboard.team")) return { ok: false, code: "FORBIDDEN", message: "Only leads and admins can set project targets." };
    if (typeof projectId !== "string" || !projectId) return { ok: false, code: "VALIDATION", message: "Choose a project." };
    if (typeof year !== "number" || !Number.isInteger(year) || year < 2020 || year > 2100) {
      return { ok: false, code: "VALIDATION", message: "Year must be between 2020 and 2100." };
    }
    return { ok: true, options: await itemOptions(dbFor(user), projectId, year) };
  }, unauthResult);
}
