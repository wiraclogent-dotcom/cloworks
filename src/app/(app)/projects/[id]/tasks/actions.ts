"use server";

import { revalidatePath } from "next/cache";
import type { ProjectStage, ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import { can } from "@/lib/permissions";
import { PROJECT_STAGES, taskMode } from "@/lib/projectProgress";
import { TASK_STATUS_ORDER, cleanFileUrl, cleanTaskDate, dateOrderError, jakartaDay, jakartaIso } from "@/lib/projectTasks";

export type TaskStageCode = "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "UNAUTHENTICATED";
export type TaskStageResult = { ok: true; stage: ProjectStage } | { ok: false; code: TaskStageCode; message: string };

/** Sets one variant's stage. Needs `project.manage`, and the variant must belong to this project. */
export async function setTaskStage(projectId: string, taskId: string, stage: ProjectStage): Promise<TaskStageResult> {
  return withUser<TaskStageResult, TaskStageResult>(requireUser, async (user) => {
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to change task stages." };
    if (!PROJECT_STAGES.includes(stage)) return { ok: false, code: "VALIDATION", message: "Pick a valid stage." };
    const task = await prisma.projectTask.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
    if (!task) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    await prisma.projectTask.update({ where: { id: taskId }, data: { stage } });
    revalidatePath(`/projects/${projectId}/tasks`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, stage };
  }, unauthResult);
}

export type TaskFileResult = { ok: true; fileUrl: string | null } | { ok: false; code: TaskStageCode; message: string };

/** Sets or clears one variant's file link. Needs `project.manage`; only http(s) links are accepted; blank clears it. */
export async function setTaskFileUrl(projectId: string, taskId: string, url: string): Promise<TaskFileResult> {
  return withUser<TaskFileResult, TaskFileResult>(requireUser, async (user) => {
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to change file links." };
    const fileUrl = cleanFileUrl(url);
    if (fileUrl === undefined) return { ok: false, code: "VALIDATION", message: "Use a full link that starts with https://." };
    const task = await prisma.projectTask.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
    if (!task) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    await prisma.projectTask.update({ where: { id: taskId }, data: { fileUrl } });
    revalidatePath(`/projects/${projectId}/tasks`);
    return { ok: true, fileUrl };
  }, unauthResult);
}

export type TaskDateResult = { ok: true; startDate: string | null; dueDate: string | null } | { ok: false; code: TaskStageCode; message: string };

/** Sets a variant's start or due date (`YYYY-MM-DD`, blank clears). Needs `project.manage`; due can't be before start. */
export async function setTaskDate(projectId: string, taskId: string, field: "start" | "due", value: string): Promise<TaskDateResult> {
  return withUser<TaskDateResult, TaskDateResult>(requireUser, async (user) => {
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to change dates." };
    const iso = cleanTaskDate(value);
    if (iso === undefined) return { ok: false, code: "VALIDATION", message: "Use a real date." };
    const task = await prisma.projectTask.findFirst({ where: { id: taskId, projectId }, select: { id: true, startDate: true, dueDate: true } });
    if (!task) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    const startDate = field === "start" ? (iso ? jakartaDay(iso) : null) : task.startDate;
    const dueDate = field === "due" ? (iso ? jakartaDay(iso) : null) : task.dueDate;
    if (startDate && dueDate && dueDate < startDate) return { ok: false, code: "VALIDATION", message: "The due date can't be before the start date." };
    // Setting a real due date replaces a TBC; clearing the due date leaves it blank.
    await prisma.projectTask.update({
      where: { id: taskId },
      data: { startDate, dueDate, ...(field === "due" && dueDate ? { dueTbc: false } : {}) },
    });
    revalidatePath(`/projects/${projectId}/tasks`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, startDate: startDate ? jakartaIso(startDate) : null, dueDate: dueDate ? jakartaIso(dueDate) : null };
  }, unauthResult);
}

export type TaskDetailField = "title" | "subTitle" | "owner";
export type TaskDetailResult = { ok: true } | { ok: false; code: TaskStageCode; message: string };

/**
 * Sets one of a variant's names or its owner. Needs `project.manage`. Product + variant name must stay unique within
 * the project, because the sheet importer matches rows by that pair. An empty owner means unassigned.
 */
export async function setTaskDetail(projectId: string, taskId: string, field: TaskDetailField, value: string): Promise<TaskDetailResult> {
  return withUser<TaskDetailResult, TaskDetailResult>(requireUser, async (user) => {
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to edit details." };
    const task = await prisma.projectTask.findFirst({ where: { id: taskId, projectId }, select: { id: true, title: true, subTitle: true } });
    if (!task) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };

    if (field === "owner") {
      const ownerId = value.trim() && value !== "none" ? value.trim() : null;
      if (ownerId) {
        const owner = await prisma.user.findFirst({ where: { id: ownerId, active: true, jobRole: "DESIGNER" }, select: { id: true } });
        if (!owner) return { ok: false, code: "VALIDATION", message: "Pick an active designer." };
      }
      await prisma.projectTask.update({ where: { id: taskId }, data: { ownerId } });
    } else {
      const text = value.trim();
      if (field === "title" && !text) return { ok: false, code: "VALIDATION", message: "An item name is required." };
      if (text.length > 200) return { ok: false, code: "VALIDATION", message: "Keep names under 200 characters." };
      const title = field === "title" ? text : task.title;
      const subTitle = field === "subTitle" ? (text || null) : task.subTitle;
      const clash = await prisma.projectTask.findFirst({
        where: { projectId, title, subTitle, NOT: { id: taskId } },
        select: { id: true },
      });
      if (clash) return { ok: false, code: "VALIDATION", message: "Another detail already has this item and detail name." };
      await prisma.projectTask.update({ where: { id: taskId }, data: field === "title" ? { title } : { subTitle } });
    }
    revalidatePath(`/projects/${projectId}/tasks`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  }, unauthResult);
}

export type TaskStatusResult = { ok: true; status: ProjectStatus } | { ok: false; code: TaskStageCode; message: string };

/** Sets one tracker task's status. Needs `project.manage`; the task must belong to this project. */
export async function setTaskStatus(projectId: string, taskId: string, status: ProjectStatus): Promise<TaskStatusResult> {
  return withUser<TaskStatusResult, TaskStatusResult>(requireUser, async (user) => {
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to change status." };
    if (!TASK_STATUS_ORDER.includes(status)) return { ok: false, code: "VALIDATION", message: "Pick a valid status." };
    const task = await prisma.projectTask.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
    if (!task) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    await prisma.projectTask.update({ where: { id: taskId }, data: { status } });
    revalidatePath(`/projects/${projectId}/tasks`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, status };
  }, unauthResult);
}

export type NewDetailInput = {
  title: string; subTitle: string; ownerId: string; value: string; startDate: string; dueDate: string; fileUrl: string;
};
export type CreateDetailResult = { ok: true; id: string } | { ok: false; code: TaskStageCode; message: string };

/**
 * Adds a row to a project. The Stage or Status value must match what the project uses (stages for design projects,
 * statuses for tracker projects). New rows go to the bottom of the table. Needs `project.manage`.
 */
export async function createTaskDetail(projectId: string, input: NewDetailInput): Promise<CreateDetailResult> {
  return withUser<CreateDetailResult, CreateDetailResult>(requireUser, async (user) => {
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to add details." };
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return { ok: false, code: "NOT_FOUND", message: "This project does not exist." };

    const title = input.title.trim();
    if (!title) return { ok: false, code: "VALIDATION", message: "An item name is required." };
    const subTitle = input.subTitle.trim() || null;
    if (title.length > 200 || (subTitle && subTitle.length > 200)) return { ok: false, code: "VALIDATION", message: "Keep names under 200 characters." };

    const existing = await prisma.projectTask.findMany({ where: { projectId }, select: { position: true, stage: true, status: true } });
    const statusMode = taskMode(existing) === "status";

    let stage: ProjectStage | null = null;
    let status: ProjectStatus | null = null;
    if (input.value) {
      if (statusMode) {
        if (!TASK_STATUS_ORDER.includes(input.value as ProjectStatus)) return { ok: false, code: "VALIDATION", message: "Pick a valid status." };
        status = input.value as ProjectStatus;
      } else {
        if (!PROJECT_STAGES.includes(input.value as ProjectStage)) return { ok: false, code: "VALIDATION", message: "Pick a valid stage." };
        stage = input.value as ProjectStage;
      }
    }

    const ownerId = input.ownerId && input.ownerId !== "none" ? input.ownerId : null;
    if (ownerId) {
      const owner = await prisma.user.findFirst({ where: { id: ownerId, active: true, jobRole: "DESIGNER" }, select: { id: true } });
      if (!owner) return { ok: false, code: "VALIDATION", message: "Pick an active designer." };
    }

    const startIso = cleanTaskDate(input.startDate);
    const dueIso = cleanTaskDate(input.dueDate);
    if (startIso === undefined || dueIso === undefined) return { ok: false, code: "VALIDATION", message: "Use real dates." };
    const orderError = dateOrderError(startIso, dueIso);
    if (orderError) return { ok: false, code: "VALIDATION", message: orderError };

    const fileUrl = cleanFileUrl(input.fileUrl);
    if (fileUrl === undefined) return { ok: false, code: "VALIDATION", message: "Use a full link that starts with https://." };

    const clash = await prisma.projectTask.findFirst({ where: { projectId, title, subTitle }, select: { id: true } });
    if (clash) return { ok: false, code: "VALIDATION", message: "Another detail already has this item and detail name." };

    const position = existing.reduce((max, t) => Math.max(max, t.position), 0) + 1;
    const created = await prisma.projectTask.create({
      data: {
        projectId, position, title, subTitle, ownerId, stage, status,
        startDate: startIso ? jakartaDay(startIso) : null,
        dueDate: dueIso ? jakartaDay(dueIso) : null,
        fileUrl,
      },
      select: { id: true },
    });
    revalidatePath(`/projects/${projectId}/tasks`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, id: created.id };
  }, unauthResult);
}

export type TaskChangeResult = { ok: true } | { ok: false; code: TaskStageCode; message: string };

/** Removes one row from a project. Needs `project.manage`; the row must belong to this project. */
export async function deleteTask(projectId: string, taskId: string): Promise<TaskChangeResult> {
  return withUser<TaskChangeResult, TaskChangeResult>(requireUser, async (user) => {
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to delete details." };
    const { count } = await prisma.projectTask.deleteMany({ where: { id: taskId, projectId } });
    if (count === 0) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    revalidatePath(`/projects/${projectId}/tasks`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  }, unauthResult);
}

/**
 * Moves one row up or down by one place, swapping positions with its neighbour. Moving past either end is a
 * no-op that still succeeds. Positions are renumbered 1..n first, so gaps or duplicates left by imports never
 * make a move skip or stall. Needs `project.manage`.
 */
export async function moveTask(projectId: string, taskId: string, direction: "up" | "down"): Promise<TaskChangeResult> {
  return withUser<TaskChangeResult, TaskChangeResult>(requireUser, async (user) => {
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to reorder details." };
    if (direction !== "up" && direction !== "down") return { ok: false, code: "VALIDATION", message: "Pick up or down." };
    const rows = await prisma.projectTask.findMany({ where: { projectId }, orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, position: true } });
    const from = rows.findIndex((r) => r.id === taskId);
    if (from < 0) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    const to = direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= rows.length) return { ok: true };
    const order = rows.map((r) => r.id);
    [order[from], order[to]] = [order[to], order[from]];
    const current = new Map(rows.map((r) => [r.id, r.position]));
    await prisma.$transaction(
      order.flatMap((id, i) => (current.get(id) === i + 1 ? [] : [prisma.projectTask.update({ where: { id }, data: { position: i + 1 } })])),
    );
    revalidatePath(`/projects/${projectId}/tasks`);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  }, unauthResult);
}
