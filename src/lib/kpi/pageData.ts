import { cache } from "react";
import type { JobRole } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";
import type { TeamRow } from "@/components/kpi/TeamTable";
import type { TrendPoint } from "@/components/kpi/TrendChart";
import { computeKpi } from "./metrics";
import { loadKpiRequests, loadTargets } from "./queries";
import { monthLabel, trailingMonths } from "./months";
import { loadRosterEntries, rosterPeople } from "./roster";
import { loadPersonProjectKpi, loadTeamProjectKpi } from "./projectQueries";
import { listTeamKpiPeople } from "@/lib/team";

/**
 * The KPI pages' data, shared by a section and the page summary. Wrapped in React `cache`, so the two components
 * that need the same numbers in one request run the queries once. Arguments are primitives (and the request's `db`)
 * so equal calls hit the cache.
 */

/** Team › Requests: one row per rostered person for `month`, plus how many people the automatic rule would show. */
export const teamRequestsData = cache(async (db: ScopedDb, month: string): Promise<{ rows: TeamRow[]; automaticCount: number }> => {
  const [targets, requests, entries] = await Promise.all([loadTargets(db, [month]), loadKpiRequests(db, [month]), loadRosterEntries(db, "REQUESTS")]);
  const automatic = await listTeamKpiPeople(db, targets);
  const people = await rosterPeople(db, automatic, entries);
  const rows: TeamRow[] = people.map((u) => {
    const t = targets.find((x) => x.userId === u.id) ?? null;
    return {
      userId: u.id,
      name: u.name,
      role: t?.role ?? u.jobRole,
      note: t?.note ?? null,
      kpi: computeKpi(requests, u, month, t ? { role: t.role, targetTasks: t.targetTasks } : null),
    };
  });
  return { rows, automaticCount: automatic.length };
});

/** Team › Projects: the roster-resolved people for `year`, and whether an empty table is because Manage people hid them. */
export const teamProjectsData = cache(async (db: ScopedDb, year: number) => {
  const now = new Date();
  const entries = await loadRosterEntries(db, "PROJECTS");
  const kpis = await loadTeamProjectKpi(db, year, now, {
    extraUserIds: entries.filter((e) => e.included).map((e) => e.userId),
    excludeUserIds: entries.filter((e) => !e.included).map((e) => e.userId),
  });
  // An empty table is "hidden" when removals took out people who do have targets this year.
  const removed = entries.filter((e) => !e.included).map((e) => e.userId);
  const hiddenByRoster = kpis.length === 0 && removed.length > 0 && (await db.projectKpiTarget.count({ where: { year, userId: { in: removed } } })) > 0;
  return { kpis, hiddenByRoster };
});

/** My KPI › Requests: the person's month, the target, the six-month trend and whether there is anything to show. */
export const myRequestsData = cache(async (db: ScopedDb, userId: string, jobRole: JobRole, month: string) => {
  const subject = { id: userId, jobRole };
  const months = trailingMonths(month, 6);
  const [requests, targets] = await Promise.all([loadKpiRequests(db, months), loadTargets(db, months, userId)]);
  const targetOf = (m: string) => targets.find((t) => t.month === m) ?? null;
  const resultOf = (m: string) => {
    const t = targetOf(m);
    return computeKpi(requests, subject, m, t ? { role: t.role, targetTasks: t.targetTasks } : null);
  };
  const kpi = resultOf(month);
  const target = targetOf(month);
  const points: TrendPoint[] = months.map((m) => {
    const r = resultOf(m);
    return { month: m, label: monthLabel(m), tasksDone: r.tasksDone, target: r.target };
  });
  const isEmpty = !target && kpi.tasksDone === 0 && kpi.totalOutputs === 0 && kpi.activeWorkload === 0;
  return { kpi, target, basisRole: target?.role ?? jobRole, points, isEmpty };
});

/** A person's Project KPI for `year`, once per request. */
export const personProjectKpi = cache((db: ScopedDb, userId: string, year: number) => loadPersonProjectKpi(db, userId, year, new Date()));
