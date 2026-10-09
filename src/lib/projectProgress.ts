import type { ProjectStage, ProjectStatus } from "@prisma/client";
import { TASK_STATUS_ORDER } from "./projectTasks";

// Progress summaries for a project's rows (ProjectTask). Design projects track a stage per row; tracker projects
// track a status instead. Pure: no database access.

/** Same order as the sheet's stage dropdown. */
export const PROJECT_STAGES: ProjectStage[] = ["NOT_STARTED", "FIRST_PREVIEW", "MANUSCRIPT", "TECHNICAL_ARTWORK", "APPROVAL", "FINAL_ARTWORK", "CANCELLED"];

export type TaskLike = {
  title: string;
  stage: ProjectStage | null;
  status: ProjectStatus | null;
  startDate: Date | null;
  dueDate: Date | null;
  dueTbc: boolean;
};

export type TaskMode = "stage" | "status";

/** Tracker projects set statuses (and no stages); everything else, including an empty project, is a design project. */
export function taskMode(tasks: { stage: ProjectStage | null; status: ProjectStatus | null }[]): TaskMode {
  return tasks.some((t) => t.status && !t.stage) ? "status" : "stage";
}

/** Whether one row counts as done: Final Artwork in a design project, Done in a tracker project. */
export function isTaskDone(t: Pick<TaskLike, "stage" | "status">, mode: TaskMode): boolean {
  return mode === "status" ? t.status === "DONE" : t.stage === "FINAL_ARTWORK";
}

/** Rows per status, plus how many have no status yet. */
export function statusCounts(tasks: Pick<TaskLike, "status">[]): Record<ProjectStatus | "none", number> {
  const out = { none: 0 } as Record<ProjectStatus | "none", number>;
  for (const st of TASK_STATUS_ORDER) out[st] = 0;
  for (const t of tasks) out[t.status ?? "none"]++;
  return out;
}

/** Variants per stage, plus how many have no stage yet. */
export function stageCounts(tasks: TaskLike[]): Record<ProjectStage | "none", number> {
  const out = { none: 0 } as Record<ProjectStage | "none", number>;
  for (const st of PROJECT_STAGES) out[st] = 0;
  for (const t of tasks) out[t.stage ?? "none"]++;
  return out;
}

/** A product is one sheet title; its variants are the rows under it. `finalCount` counts the done ones (see `isTaskDone`). */
export type ProductSummary = {
  title: string;
  variants: number;
  finalCount: number;
  startDate: Date | null;
  dueDate: Date | null;
  dueTbc: boolean;
};

/** One summary per product title, in the order the products first appear in the sheet. */
export function productSummaries(tasks: TaskLike[], mode: TaskMode = taskMode(tasks)): ProductSummary[] {
  const byTitle = new Map<string, ProductSummary>();
  for (const t of tasks) {
    let p = byTitle.get(t.title);
    if (!p) {
      p = { title: t.title, variants: 0, finalCount: 0, startDate: null, dueDate: null, dueTbc: false };
      byTitle.set(t.title, p);
    }
    p.variants++;
    if (isTaskDone(t, mode)) p.finalCount++;
    if (t.startDate && (!p.startDate || t.startDate < p.startDate)) p.startDate = t.startDate;
    if (t.dueDate && (!p.dueDate || t.dueDate > p.dueDate)) p.dueDate = t.dueDate;
    if (t.dueTbc) p.dueTbc = true;
  }
  return [...byTitle.values()];
}

/**
 * Share of live rows that are done, as a whole percentage. Design projects count Final Artwork and leave canceled
 * variants out; tracker projects count Done.
 */
export function finalShare(tasks: TaskLike[], mode: TaskMode = taskMode(tasks)): { done: number; total: number; percent: number } {
  const live = mode === "stage" ? tasks.filter((t) => t.stage !== "CANCELLED") : tasks;
  const done = live.filter((t) => isTaskDone(t, mode)).length;
  const total = live.length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}
