import type { Prisma, ProjectTaskEventKind } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";

/** The slice of the scoped client (or its interactive-transaction client) that the helpers below need. */
export type TaskEventDb = Pick<ScopedDb, "projectTask" | "projectTaskEvent">;
export type TaskTargetDb = Pick<ScopedDb, "projectTask" | "projectKpiTarget">;

export type TaskChange = {
  taskId: string;
  actorId: string;
  kind: ProjectTaskEventKind;
  /** Previous value (stage/status code, or a `jakartaIso` date for DUE); null when there was none. */
  from: string | null;
  to: string | null;
  /** The row update to run. */
  data: Prisma.ProjectTaskUpdateInput;
};

/**
 * Runs a task row update and, only when the tracked value really changed (`from !== to`), writes one
 * `ProjectTaskEvent` beside it. Call it inside `db.$transaction` so the update and its event land together.
 * Returns whether an event was written.
 */
export async function recordTaskChange(tx: TaskEventDb, change: TaskChange): Promise<boolean> {
  const { taskId, actorId, kind, from, to, data } = change;
  await tx.projectTask.update({ where: { id: taskId }, data });
  if (from === to) return false;
  await tx.projectTaskEvent.create({ data: { taskId, actorId, kind, fromValue: from, toValue: to } });
  return true;
}

/**
 * After an item is renamed, keeps its KPI targets attached to it. Does nothing while any row in the project still
 * carries `oldTitle` (the item still exists). Otherwise each target for `oldTitle` moves to `newTitle`; when the same
 * person and year already has a target for `newTitle`, the old one is deleted so there are no duplicates.
 */
export async function carryTargetsOnRename(tx: TaskTargetDb, projectId: string, oldTitle: string, newTitle: string): Promise<void> {
  if (oldTitle === newTitle) return;
  const stillThere = await tx.projectTask.findFirst({ where: { projectId, title: oldTitle }, select: { id: true } });
  if (stillThere) return;
  const olds = await tx.projectKpiTarget.findMany({ where: { projectId, itemTitle: oldTitle }, select: { id: true, userId: true, year: true } });
  for (const old of olds) {
    const dup = await tx.projectKpiTarget.findFirst({
      where: { projectId, userId: old.userId, year: old.year, itemTitle: newTitle },
      select: { id: true },
    });
    if (dup) await tx.projectKpiTarget.delete({ where: { id: old.id } });
    else await tx.projectKpiTarget.update({ where: { id: old.id }, data: { itemTitle: newTitle } });
  }
}
