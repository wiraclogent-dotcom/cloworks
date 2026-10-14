"use server";

import { revalidatePath } from "next/cache";
import type { ProjectStage, ProjectStatus } from "@prisma/client";
import { dbFor, requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import { can } from "@/lib/permissions";
import { FILE_LOCATION_HINT } from "@/lib/fileLocation";
import { PROJECT_STAGES, taskMode } from "@/lib/projectProgress";
import { carryTargetsOnRename, recordTaskChange } from "@/lib/projectTaskEvents";
import { TASK_STATUS_ORDER, cleanFileUrl, cleanTaskDate, dateOrderError, jakartaDay, jakartaIso } from "@/lib/projectTasks";

export type TaskStageCode = "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "UNAUTHENTICATED";
export type TaskStageResult = { ok: true; stage: ProjectStage } | { ok: false; code: TaskStageCode; message: string };

/** Sets one variant's stage. Needs `project.manage`, and the variant must belong to this project. */
export async function setTaskStage(projectId: string, taskId: string, stage: ProjectStage): Promise<TaskStageResult> {
  return withUser<TaskStageResult, TaskStageResult>(requireUser, async (user) => {
    const db = dbFor(user);
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to change task stages." };
    if (!PROJECT_STAGES.includes(stage)) return { ok: false, code: "VALIDATION", message: "Pick a valid stage." };
    const task = await db.projectTask.findFirst({ where: { id: taskId, projectId }, select: { id: true, stage: true } });
    if (!task) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    await db.$transaction((tx) => recordTaskChange(tx, { taskId, actorId: user.id, kind: "STAGE", from: task.stage, to: stage, data: { stage } }));
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, stage };
  }, unauthResult);
}

export type TaskFileResult = { ok: true; fileUrl: string | null } | { ok: false; code: TaskStageCode; message: string };

/** Sets or clears one variant's file link. Needs `project.manage`; only http(s) links are accepted; blank clears it. */
export async function setTaskFileUrl(projectId: string, taskId: string, url: string): Promise<TaskFileResult> {
  return withUser<TaskFileResult, TaskFileResult>(requireUser, async (user) => {
    const db = dbFor(user);
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to change file links." };
    const fileUrl = cleanFileUrl(url);
    if (fileUrl === undefined) return { ok: false, code: "VALIDATION", message: FILE_LOCATION_HINT };
    const task = await db.projectTask.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
    if (!task) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    await db.projectTask.update({ where: { id: taskId }, data: { fileUrl } });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, fileUrl };
  }, unauthResult);
}

export type TaskDateResult = { ok: true; startDate: string | null; dueDate: string | null } | { ok: false; code: TaskStageCode; message: string };

/** Sets a variant's start or due date (`YYYY-MM-DD`, blank clears). Needs `project.manage`; due can't be before start. */
export async function setTaskDate(projectId: string, taskId: string, field: "start" | "due", value: string): Promise<TaskDateResult> {
  return withUser<TaskDateResult, TaskDateResult>(requireUser, async (user) => {
    const db = dbFor(user);
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to change dates." };
    const iso = cleanTaskDate(value);
    if (iso === undefined) return { ok: false, code: "VALIDATION", message: "Use a real date." };
    const task = await db.projectTask.findFirst({ where: { id: taskId, projectId }, select: { id: true, startDate: true, dueDate: true } });
    if (!task) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    const startDate = field === "start" ? (iso ? jakartaDay(iso) : null) : task.startDate;
    const dueDate = field === "due" ? (iso ? jakartaDay(iso) : null) : task.dueDate;
    if (startDate && dueDate && dueDate < startDate) return { ok: false, code: "VALIDATION", message: "The due date can't be before the start date." };
    // Setting a real due date replaces a TBC; clearing the due date leaves it blank.
    const data = { startDate, dueDate, ...(field === "due" && dueDate ? { dueTbc: false } : {}) };
    if (field === "due") {
      await db.$transaction((tx) => recordTaskChange(tx, {
        taskId, actorId: user.id, kind: "DUE",
        from: task.dueDate ? jakartaIso(task.dueDate) : null, to: dueDate ? jakartaIso(dueDate) : null, data,
      }));
    } else {
      await db.projectTask.update({ where: { id: taskId }, data });
    }
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
    const db = dbFor(user);
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to edit details." };
    const task = await db.projectTask.findFirst({ where: { id: taskId, projectId }, select: { id: true, title: true, subTitle: true } });
    if (!task) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };

    if (field === "owner") {
      const ownerId = value.trim() && value !== "none" ? value.trim() : null;
      if (ownerId) {
        const owner = await db.user.findFirst({ where: { id: ownerId, active: true, jobRole: "DESIGNER" }, select: { id: true } });
        if (!owner) return { ok: false, code: "VALIDATION", message: "Pick an active designer." };
      }
      await db.projectTask.update({ where: { id: taskId }, data: { ownerId } });
    } else {
      const text = value.trim();
      if (field === "title" && !text) return { ok: false, code: "VALIDATION", message: "An item name is required." };
      if (text.length > 200) return { ok: false, code: "VALIDATION", message: "Keep names under 200 characters." };
      const title = field === "title" ? text : task.title;
      const subTitle = field === "subTitle" ? (text || null) : task.subTitle;
      const clash = await db.projectTask.findFirst({
        where: { projectId, title, subTitle, NOT: { id: taskId } },
        select: { id: true },
      });
      if (clash) return { ok: false, code: "VALIDATION", message: "Another detail already has this item and detail name." };
      if (field === "title") {
        await db.$transaction(async (tx) => {
          await tx.projectTask.update({ where: { id: taskId }, data: { title } });
          await carryTargetsOnRename(tx, projectId, task.title, title);
        });
      } else {
        await db.projectTask.update({ where: { id: taskId }, data: { subTitle } });
      }
    }
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  }, unauthResult);
}

export type ItemRenameResult = { ok: true } | { ok: false; code: TaskStageCode; message: string };

/**
 * Renames a whole item: every row titled `oldTitle` in this project gets `newTitle`, and the item's KPI targets follow.
 * Needs `project.manage`. The new name is trimmed, required and at most 200 characters, and can't be another item's name
 * (that would merge two items). The same name is a successful no-op.
 */
export async function renameItem(projectId: string, oldTitle: string, newTitle: string): Promise<ItemRenameResult> {
  return withUser<ItemRenameResult, ItemRenameResult>(requireUser, async (user) => {
    const db = dbFor(user);
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to rename items." };
    const title = newTitle.trim();
    if (!title) return { ok: false, code: "VALIDATION", message: "An item name is required." };
    if (title.length > 200) return { ok: false, code: "VALIDATION", message: "Keep names under 200 characters." };
    const rows = await db.projectTask.findMany({ where: { projectId, title: oldTitle }, select: { id: true } });
    if (rows.length === 0) return { ok: false, code: "NOT_FOUND", message: "That item is not in this project." };
    if (title === oldTitle) return { ok: true };
    const clash = await db.projectTask.findFirst({ where: { projectId, title }, select: { id: true } });
    if (clash) return { ok: false, code: "VALIDATION", message: "Another item already has this name." };
    await db.$transaction(async (tx) => {
      await tx.projectTask.updateMany({ where: { projectId, title: oldTitle }, data: { title } });
      await carryTargetsOnRename(tx, projectId, oldTitle, title);
    });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  }, unauthResult);
}

export type TaskStatusResult = { ok: true; status: ProjectStatus } | { ok: false; code: TaskStageCode; message: string };

/** Sets one tracker task's status. Needs `project.manage`; the task must belong to this project. */
export async function setTaskStatus(projectId: string, taskId: string, status: ProjectStatus): Promise<TaskStatusResult> {
  return withUser<TaskStatusResult, TaskStatusResult>(requireUser, async (user) => {
    const db = dbFor(user);
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to change status." };
    if (!TASK_STATUS_ORDER.includes(status)) return { ok: false, code: "VALIDATION", message: "Pick a valid status." };
    const task = await db.projectTask.findFirst({ where: { id: taskId, projectId }, select: { id: true, status: true } });
    if (!task) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    await db.$transaction((tx) => recordTaskChange(tx, { taskId, actorId: user.id, kind: "STATUS", from: task.status, to: status, data: { status } }));
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, status };
  }, unauthResult);
}

export type ItemBulkResult = { ok: true; changed: number } | { ok: false; code: TaskStageCode; message: string };

/**
 * Sets the stage of every variant of one item (all rows sharing `itemTitle` in this project). Needs `project.manage`.
 * Variants whose stage is CANCELLED are skipped unless the target is CANCELLED itself; variants already at the target
 * are skipped. Runs in one transaction and writes one STAGE event per changed variant. Returns how many changed.
 */
export async function setItemStage(projectId: string, itemTitle: string, stage: ProjectStage): Promise<ItemBulkResult> {
  return withUser<ItemBulkResult, ItemBulkResult>(requireUser, async (user) => {
    const db = dbFor(user);
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to change task stages." };
    if (!PROJECT_STAGES.includes(stage)) return { ok: false, code: "VALIDATION", message: "Pick a valid stage." };
    const tasks = await db.projectTask.findMany({ where: { projectId, title: itemTitle }, select: { id: true, stage: true } });
    if (tasks.length === 0) return { ok: false, code: "NOT_FOUND", message: "That item is not in this project." };
    const targets = tasks.filter((t) => t.stage !== stage && (t.stage !== "CANCELLED" || stage === "CANCELLED"));
    await db.$transaction(async (tx) => {
      for (const t of targets) await recordTaskChange(tx, { taskId: t.id, actorId: user.id, kind: "STAGE", from: t.stage, to: stage, data: { stage } });
    });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, changed: targets.length };
  }, unauthResult);
}

/**
 * Sets the status of every variant of one item. Needs `project.manage`; CANCELLED is a project-only status and is not
 * valid here. Variants already at the target are skipped. Runs in one transaction and writes one STATUS event per
 * changed variant. Returns how many changed.
 */
export async function setItemStatus(projectId: string, itemTitle: string, status: ProjectStatus): Promise<ItemBulkResult> {
  return withUser<ItemBulkResult, ItemBulkResult>(requireUser, async (user) => {
    const db = dbFor(user);
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to change status." };
    if (!TASK_STATUS_ORDER.includes(status)) return { ok: false, code: "VALIDATION", message: "Pick a valid status." };
    const tasks = await db.projectTask.findMany({ where: { projectId, title: itemTitle }, select: { id: true, status: true } });
    if (tasks.length === 0) return { ok: false, code: "NOT_FOUND", message: "That item is not in this project." };
    const targets = tasks.filter((t) => t.status !== status);
    await db.$transaction(async (tx) => {
      for (const t of targets) await recordTaskChange(tx, { taskId: t.id, actorId: user.id, kind: "STATUS", from: t.status, to: status, data: { status } });
    });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, changed: targets.length };
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
    const db = dbFor(user);
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to add details." };
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return { ok: false, code: "NOT_FOUND", message: "This project does not exist." };

    const title = input.title.trim();
    if (!title) return { ok: false, code: "VALIDATION", message: "An item name is required." };
    const subTitle = input.subTitle.trim() || null;
    if (title.length > 200 || (subTitle && subTitle.length > 200)) return { ok: false, code: "VALIDATION", message: "Keep names under 200 characters." };

    const existing = await db.projectTask.findMany({ where: { projectId }, select: { position: true, stage: true, status: true } });
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
      const owner = await db.user.findFirst({ where: { id: ownerId, active: true, jobRole: "DESIGNER" }, select: { id: true } });
      if (!owner) return { ok: false, code: "VALIDATION", message: "Pick an active designer." };
    }

    const startIso = cleanTaskDate(input.startDate);
    const dueIso = cleanTaskDate(input.dueDate);
    if (startIso === undefined || dueIso === undefined) return { ok: false, code: "VALIDATION", message: "Use real dates." };
    const orderError = dateOrderError(startIso, dueIso);
    if (orderError) return { ok: false, code: "VALIDATION", message: orderError };

    const fileUrl = cleanFileUrl(input.fileUrl);
    if (fileUrl === undefined) return { ok: false, code: "VALIDATION", message: FILE_LOCATION_HINT };

    const clash = await db.projectTask.findFirst({ where: { projectId, title, subTitle }, select: { id: true } });
    if (clash) return { ok: false, code: "VALIDATION", message: "Another detail already has this item and detail name." };

    // A new variant of an existing item goes right after that item's last row (later rows shift down by one); a new item goes last.
    const lastOfItem = (await db.projectTask.findMany({ where: { projectId, title }, select: { position: true } })).reduce((max, t) => Math.max(max, t.position), 0);
    const position = lastOfItem > 0 ? lastOfItem + 1 : existing.reduce((max, t) => Math.max(max, t.position), 0) + 1;
    const created = await db.$transaction(async (tx) => {
      if (lastOfItem > 0) await tx.projectTask.updateMany({ where: { projectId, position: { gte: position } }, data: { position: { increment: 1 } } });
      return tx.projectTask.create({
        data: {
          projectId, position, title, subTitle, ownerId, stage, status,
          startDate: startIso ? jakartaDay(startIso) : null,
          dueDate: dueIso ? jakartaDay(dueIso) : null,
          fileUrl,
        },
        select: { id: true },
      });
    });
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, id: created.id };
  }, unauthResult);
}

export type TaskChangeResult = { ok: true } | { ok: false; code: TaskStageCode; message: string };

/** Removes one row from a project. Needs `project.manage`; the row must belong to this project. */
export async function deleteTask(projectId: string, taskId: string): Promise<TaskChangeResult> {
  return withUser<TaskChangeResult, TaskChangeResult>(requireUser, async (user) => {
    const db = dbFor(user);
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to delete details." };
    const { count } = await db.projectTask.deleteMany({ where: { id: taskId, projectId } });
    if (count === 0) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  }, unauthResult);
}

/**
 * Moves one row up or down within its item, swapping positions with the nearest row that has the same item
 * title in that direction (other items keep their places). Moving past the item's first or last row is a
 * no-op that still succeeds. Positions are renumbered 1..n first, so gaps or duplicates left by imports never
 * make a move skip or stall. Needs `project.manage`.
 */
export async function moveTask(projectId: string, taskId: string, direction: "up" | "down"): Promise<TaskChangeResult> {
  return withUser<TaskChangeResult, TaskChangeResult>(requireUser, async (user) => {
    const db = dbFor(user);
    if (!can(user.appRole, "project.manage")) return { ok: false, code: "FORBIDDEN", message: "You are not allowed to reorder details." };
    if (direction !== "up" && direction !== "down") return { ok: false, code: "VALIDATION", message: "Pick up or down." };
    const rows = await db.projectTask.findMany({ where: { projectId }, orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, position: true, title: true } });
    const from = rows.findIndex((r) => r.id === taskId);
    if (from < 0) return { ok: false, code: "NOT_FOUND", message: "That detail is not in this project." };
    // A variant only trades places with the nearest variant of its own item in that direction; at the item's edge it stays put.
    let to = from;
    do to += direction === "up" ? -1 : 1; while (to >= 0 && to < rows.length && rows[to].title !== rows[from].title);
    if (to < 0 || to >= rows.length) return { ok: true };
    const order = rows.map((r) => r.id);
    [order[from], order[to]] = [order[to], order[from]];
    const current = new Map(rows.map((r) => [r.id, r.position]));
    await db.$transaction(
      order.flatMap((id, i) => (current.get(id) === i + 1 ? [] : [db.projectTask.update({ where: { id }, data: { position: i + 1 } })])),
    );
    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  }, unauthResult);
}
