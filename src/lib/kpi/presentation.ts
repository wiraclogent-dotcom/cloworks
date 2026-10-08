/**
 * Presentational KPI helpers (pure, client-safe): progress thresholds, the My KPI tiles and the Team KPI summary.
 * They only arrange numbers computeKpi() already produced, with the existing formatters (null → "—").
 */
import { JobRole } from "@prisma/client";
import { formatCount, formatDays, formatPercent, progressPercent } from "./format";
import type { KpiResult } from "./metrics";

/**
 * Progress thresholds (percent of the monthly target):
 *   below 50       → "low"      (amber fill, --progress-low)
 *   50 up to 99    → "mid"      (Aqua fill, --progress-mid)
 *   100 and above  → "complete" (green fill + check, --progress-complete)
 * Colour is never the only signal: the percentage is always printed and "complete" adds a check icon.
 */
export const PROGRESS_THRESHOLDS = { mid: 50, complete: 100 } as const;
export type ProgressLevel = "low" | "mid" | "complete";

export function progressLevel(pct: number): ProgressLevel {
  if (pct >= PROGRESS_THRESHOLDS.complete) return "complete";
  if (pct >= PROGRESS_THRESHOLDS.mid) return "mid";
  return "low";
}

/** Short words for the level (sr-only text next to the bar, and tooltips). */
export const PROGRESS_LEVEL_LABEL: Record<ProgressLevel, string> = {
  low: "below half of target",
  mid: "on the way",
  complete: "target reached",
};

export type KpiTileData = {
  key: "tasksDone" | "target" | "progress" | "onTime" | "turnaround" | "revisions" | "outputs" | "workload";
  label: string;
  value: string;
  hint?: string;
};

/**
 * The My KPI tiles, in order. Values and hints are exactly the ones the page showed before the redesign
 * (formatPercent/formatDays/formatCount, "—" for null, workload only for designers).
 */
export function myKpiTiles(kpi: KpiResult, basisRole: JobRole): KpiTileData[] {
  const pct = progressPercent(kpi.progress);
  const designer = basisRole === JobRole.DESIGNER;
  return [
    { key: "tasksDone", label: "Tasks done", value: formatCount(kpi.tasksDone) },
    { key: "target", label: "Target", value: formatCount(kpi.target), hint: kpi.target === null ? "No target set for this month." : undefined },
    { key: "progress", label: "Progress", value: pct === null ? "—" : `${pct}%` },
    { key: "onTime", label: "On-time rate", value: formatPercent(kpi.onTimeRate), hint: kpi.onTimeRate === null ? "No finished tasks with a deadline this month." : undefined },
    { key: "turnaround", label: "Avg turnaround (working days)", value: formatDays(kpi.avgTurnaroundDays), hint: kpi.avgTurnaroundDays === null ? "No finished tasks this month." : undefined },
    { key: "revisions", label: "Revision rounds", value: formatCount(kpi.revisionRounds) },
    { key: "outputs", label: "Total outputs", value: formatCount(kpi.totalOutputs) },
    { key: "workload", label: "Active workload", value: designer ? formatCount(kpi.activeWorkload) : "—", hint: designer ? "Open requests assigned to this person." : "Only tracked for designers." },
  ];
}

export type TeamSummary = { people: number; tasksDone: number; avgProgress: number | null; withTarget: number };

/**
 * Team KPI summary from the rows already on the page: number of people, total tasks done, and the average progress
 * (mean of each person's whole percent, over people who have a measurable target; null when nobody has one).
 */
export function teamSummary(rows: { kpi: Pick<KpiResult, "tasksDone" | "progress"> }[]): TeamSummary {
  const pcts = rows.map((r) => progressPercent(r.kpi.progress)).filter((p): p is number => p !== null);
  return {
    people: rows.length,
    tasksDone: rows.reduce((n, r) => n + r.kpi.tasksDone, 0),
    avgProgress: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    withTarget: pcts.length,
  };
}
