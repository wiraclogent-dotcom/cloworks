import { formatCount, progressPercent } from "./format";
import { teamSummary } from "./presentation";
import type { PersonProjectKpi } from "./projectQueries";

/** One summary card. `key` picks the icon and is the card's `data-kpi`. */
export type SummaryCell = { key: "people" | "reqDone" | "reqProgress" | "projDone" | "projOnTime"; label: string; value: string; hint?: string };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** 'YYYY-MM' -> "Oct 2026". */
export const shortMonthLabel = (month: string) => `${MON[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

type Quarters = Pick<PersonProjectKpi, "quarters">;

/** Done / items and on time / late summed over every quarter of the given people (the Projects table's Done column). */
export function projectTotals(kpis: Quarters[]): { done: number; items: number; onTime: number; late: number } {
  const t = { done: 0, items: 0, onTime: 0, late: 0 };
  for (const k of kpis) for (const q of [1, 2, 3, 4] as const) {
    const s = k.quarters[q].score;
    t.done += s.done; t.items += s.items; t.onTime += s.onTimeCount; t.late += s.lateCount;
  }
  return t;
}

const onTimeValue = (t: { onTime: number; late: number }) => (t.onTime + t.late === 0 ? "—" : `${Math.round((t.onTime / (t.onTime + t.late)) * 100)}%`);
const projDone = (t: { done: number; items: number }, year: number): SummaryCell => ({ key: "projDone", label: `Project items done · ${year}`, value: t.items === 0 ? "—" : `${t.done}/${t.items}` });
const projOnTime = (t: { onTime: number; late: number }, year: number): SummaryCell => ({ key: "projOnTime", label: `Project on time · ${year}`, value: onTimeValue(t) });

/**
 * Team KPI summary across both rosters: people (union), request totals for the month (a request several people
 * share counts once: the union of each row's `doneRequestIds`), project totals for the year.
 */
export function teamSummaryCells({ month, year, requestRows, projectKpis }: {
  month: string; year: number;
  requestRows: { userId: string; kpi: { doneRequestIds: string[]; progress: number | null } }[];
  projectKpis: (Quarters & { userId: string })[];
}): SummaryCell[] {
  const sum = teamSummary(requestRows);
  const people = new Set([...requestRows.map((r) => r.userId), ...projectKpis.map((k) => k.userId)]);
  const period = shortMonthLabel(month);
  const totals = projectTotals(projectKpis);
  return [
    { key: "people", label: "People", value: formatCount(people.size), hint: `${requestRows.length} ${requestRows.length === 1 ? "request" : "requests"} · ${projectKpis.length} ${projectKpis.length === 1 ? "project" : "projects"}` },
    { key: "reqDone", label: `Request tasks done · ${period}`, value: formatCount(sum.tasksDone),
      hint: "Each request counted once, even when several people worked on it." },
    { key: "reqProgress", label: `Request target progress · ${period}`, value: sum.avgProgress === null ? "—" : `${sum.avgProgress}%`,
      hint: sum.avgProgress === null ? "Nobody has a target this month." : `Across ${sum.withTarget} ${sum.withTarget === 1 ? "person" : "people"} with a target.` },
    projDone(totals, year),
    projOnTime(totals, year),
  ];
}

/**
 * One person's summary: the Team cards without People. `request` is null when the Requests section is empty that
 * month; `project` is null (or has no items) when there are no project targets that year. Empty sections show "—".
 */
export function personSummaryCells({ month, year, request, project }: {
  month: string; year: number;
  request: { tasksDone: number; target: number | null; progress: number | null } | null;
  project: Quarters | null;
}): SummaryCell[] {
  const period = shortMonthLabel(month);
  const pct = request ? progressPercent(request.progress) : null;
  const totals = project ? projectTotals([project]) : { done: 0, items: 0, onTime: 0, late: 0 };
  return [
    { key: "reqDone", label: `Request tasks done · ${period}`, value: request ? formatCount(request.tasksDone) : "—" },
    { key: "reqProgress", label: `Request target progress · ${period}`, value: pct === null ? "—" : `${pct}%`,
      hint: request && request.target !== null && pct !== null ? `${request.tasksDone} of ${request.target} tasks` : "No target this month." },
    projDone(totals, year),
    projOnTime(totals, year),
  ];
}
