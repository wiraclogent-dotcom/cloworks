"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import { can } from "@/lib/permissions";
import { cleanTaskDate, jakartaDay } from "@/lib/projectTasks";

export type MilestoneCode = "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "UNAUTHENTICATED";
export type MilestoneResult = { ok: true; id: string } | { ok: false; code: MilestoneCode; message: string };
export type MilestoneInput = { title: string; date: string; done: boolean };

type Clean = { ok: true; data: { title: string; date: Date; done: boolean } } | { ok: false; code: "VALIDATION"; message: string };

function clean(input: MilestoneInput): Clean {
  const title = input.title.trim();
  if (!title) return { ok: false, code: "VALIDATION", message: "A name is required." };
  if (title.length > 200) return { ok: false, code: "VALIDATION", message: "Keep the name under 200 characters." };
  const iso = cleanTaskDate(input.date);
  if (!iso) return { ok: false, code: "VALIDATION", message: "Pick a real date." };
  return { ok: true, data: { title, date: jakartaDay(iso), done: input.done === true } };
}

/** Adds a meeting or milestone to a project. Needs `project.manage`. */
export async function createMilestone(projectId: string, input: MilestoneInput): Promise<MilestoneResult> {
  return withUser<MilestoneResult, MilestoneResult>(requireUser, async (user) => {
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to add milestones." };
    const c = clean(input);
    if (!c.ok) return c;
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return { ok: false, code: "NOT_FOUND", message: "This project does not exist." };
    const created = await prisma.projectMilestone.create({ data: { projectId, ...c.data }, select: { id: true } });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, id: created.id };
  }, unauthResult);
}

/** Changes a milestone's name, date and done flag. Needs `project.manage`; the milestone must belong to this project. */
export async function updateMilestone(projectId: string, milestoneId: string, input: MilestoneInput): Promise<MilestoneResult> {
  return withUser<MilestoneResult, MilestoneResult>(requireUser, async (user) => {
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to edit milestones." };
    const c = clean(input);
    if (!c.ok) return c;
    const { count } = await prisma.projectMilestone.updateMany({ where: { id: milestoneId, projectId }, data: c.data });
    if (count === 0) return { ok: false, code: "NOT_FOUND", message: "That milestone is not in this project." };
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, id: milestoneId };
  }, unauthResult);
}

/** Removes a milestone. Needs `project.manage`; the milestone must belong to this project. */
export async function deleteMilestone(projectId: string, milestoneId: string): Promise<MilestoneResult> {
  return withUser<MilestoneResult, MilestoneResult>(requireUser, async (user) => {
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to delete milestones." };
    const { count } = await prisma.projectMilestone.deleteMany({ where: { id: milestoneId, projectId } });
    if (count === 0) return { ok: false, code: "NOT_FOUND", message: "That milestone is not in this project." };
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, id: milestoneId };
  }, unauthResult);
}
