import { dayOf, monthOf } from "./jakarta";
import type { KpiResult } from "./metrics";

/** A Content Plan post as the social media KPI sees it (kind PLANNED only; see loadKpiPosts). */
export type KpiPost = { id: string; authorId: string; approvedAt: Date | null; plannedAt: Date | null };

/**
 * Social media KPI (spec 2026-10-22): the author's posts approved in the Jakarta `month`, against the month's target.
 * On time = approved on or before the planned day. The request-only numbers stay empty, so the KPI table, summary and
 * export can show it like a request KPI. `doneRequestIds` holds post ids (a team total counts each post once).
 */
export function computeContentKpi(posts: KpiPost[], userId: string, month: string, target: { targetTasks: number } | null): KpiResult {
  const done = posts.filter((p) => p.authorId === userId && p.approvedAt !== null && monthOf(p.approvedAt) === month);
  const planned = done.filter((p) => p.plannedAt !== null);
  const onTime = planned.filter((p) => dayOf(p.approvedAt!) <= dayOf(p.plannedAt!)).length;
  return {
    tasksDone: done.length,
    doneRequestIds: done.map((p) => p.id),
    target: target ? target.targetTasks : null,
    progress: target && target.targetTasks > 0 ? done.length / target.targetTasks : null,
    onTimeRate: planned.length > 0 ? onTime / planned.length : null,
    avgTurnaroundDays: null,
    revisionRounds: 0,
    totalOutputs: 0,
    activeWorkload: 0,
  };
}
