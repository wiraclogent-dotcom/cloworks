import { cache } from "react";
import type { JobRole } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";
import type { TeamRow } from "@/components/kpi/TeamTable";
import type { TrendPoint } from "@/components/kpi/TrendChart";
import { computeKpi, type KpiRequest, type KpiResult } from "./metrics";
import { computeContentKpi, type KpiPost } from "./contentMetrics";
import { loadKpiPosts, loadKpiRequests, loadTargets } from "./queries";
import { measureOfBasis, type KpiTeam } from "./team";
import { monthLabel, trailingMonths } from "./months";
import { loadRosterEntries, rosterPeople } from "./roster";
import { loadPersonProjectKpi, loadTeamProjectKpi } from "./projectQueries";
import { listSocialKpiPeople, listTeamKpiPeople } from "@/lib/team";

/**
 * The KPI pages' data, shared by a section and the page summary. Wrapped in React `cache`, so the two components
 * that need the same numbers in one request run the queries once. Arguments are primitives (and the request's `db`)
 * so equal calls hit the cache.
 */

/** A person's month by basis: SOCIAL_MEDIA counts approved Content Plan posts, anything else requests. */
function kpiFor(basis: JobRole, requests: KpiRequest[], posts: KpiPost[], user: { id: string; jobRole: JobRole }, month: string,
  target: { role: JobRole; targetTasks: number } | null): KpiResult {
  return basis === "SOCIAL_MEDIA" ? computeContentKpi(posts, user.id, month, target) : computeKpi(requests, user, month, target);
}

/**
 * Team › main section: one row per rostered person of `team` for `month`, plus how many people the automatic rule
 * would show. The social media team is measured in approved posts, every row as SOCIAL_MEDIA whatever role a stored
 * target has, so the target editor saves social media targets.
 */
export const teamRequestsData = cache(async (db: ScopedDb, month: string, team: KpiTeam = "creative"): Promise<{ rows: TeamRow[]; automaticCount: number }> => {
  if (team === "social") {
    const [targets, posts, entries] = await Promise.all([loadTargets(db, [month]), loadKpiPosts(db, [month]), loadRosterEntries(db, "REQUESTS")]);
    const automatic = await listSocialKpiPeople(db, targets);
    const people = await rosterPeople(db, automatic, entries, "social");
    const rows: TeamRow[] = people.map((u) => {
      const t = targets.find((x) => x.userId === u.id) ?? null;
      return { userId: u.id, name: u.name, role: "SOCIAL_MEDIA", note: t?.note ?? null, kpi: computeContentKpi(posts, u.id, month, t) };
    });
    return { rows, automaticCount: automatic.length };
  }
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

/**
 * Team › Projects: the roster-resolved people of `team` for `year` (job role SOCIAL_MEDIA → social, anyone else →
 * creative), and whether an empty table is because Manage people hid them.
 */
export const teamProjectsData = cache(async (db: ScopedDb, year: number, team: KpiTeam = "creative") => {
  const now = new Date();
  const entries = await loadRosterEntries(db, "PROJECTS");
  const kpis = (await loadTeamProjectKpi(db, year, now, {
    extraUserIds: entries.filter((e) => e.included).map((e) => e.userId),
    excludeUserIds: entries.filter((e) => !e.included).map((e) => e.userId),
  })).filter((k) => (k.jobRole === "SOCIAL_MEDIA") === (team === "social"));
  // An empty table is "hidden" when removals took out people who do have targets this year.
  const removed = entries.filter((e) => !e.included).map((e) => e.userId);
  const hiddenByRoster = kpis.length === 0 && removed.length > 0 && (await db.projectKpiTarget.count({ where: { year, userId: { in: removed } } })) > 0;
  return { kpis, hiddenByRoster };
});

/**
 * My KPI › main section: the person's month, the target, the six-month trend, whether there is anything to show, and
 * what this month is measured in (posts for a SOCIAL_MEDIA basis). Posts are loaded only when some month needs them.
 */
export const myRequestsData = cache(async (db: ScopedDb, userId: string, jobRole: JobRole, month: string) => {
  const subject = { id: userId, jobRole };
  const months = trailingMonths(month, 6);
  const [requests, targets] = await Promise.all([loadKpiRequests(db, months), loadTargets(db, months, userId)]);
  const targetOf = (m: string) => targets.find((t) => t.month === m) ?? null;
  const basisOf = (m: string) => targetOf(m)?.role ?? jobRole;
  const posts = months.some((m) => basisOf(m) === "SOCIAL_MEDIA") ? await loadKpiPosts(db, months, [userId]) : [];
  const resultOf = (m: string) => {
    const t = targetOf(m);
    return kpiFor(basisOf(m), requests, posts, subject, m, t ? { role: t.role, targetTasks: t.targetTasks } : null);
  };
  const kpi = resultOf(month);
  const target = targetOf(month);
  const points: TrendPoint[] = months.map((m) => {
    const r = resultOf(m);
    return { month: m, label: monthLabel(m), tasksDone: r.tasksDone, target: r.target };
  });
  const isEmpty = !target && kpi.tasksDone === 0 && kpi.totalOutputs === 0 && kpi.activeWorkload === 0;
  const basisRole = basisOf(month);
  return { kpi, target, basisRole, measure: measureOfBasis(basisRole), points, isEmpty };
});

/** A person's Project KPI for `year`, once per request. */
export const personProjectKpi = cache((db: ScopedDb, userId: string, year: number) => loadPersonProjectKpi(db, userId, year, new Date()));
