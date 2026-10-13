import type { ScopedDb } from "@/lib/db";
import {
  itemFacts, jakartaQuarter,
  type ItemEvent, type ItemFacts, type ItemRow, type Quarter,
} from "./projectItems";
import { cycleDays, scoreQuarter, scoreYear, type QuarterScore } from "./projectScore";

// Loads project targets, rows and change events in a fixed number of queries and feeds the pure item/score modules.

const QUARTERS: Quarter[] = [1, 2, 3, 4];

/** A target item: its facts plus the target row's id (so the UI can remove it). */
export type TargetItem = ItemFacts & { targetId: string };

export type PersonProjectKpi = {
  userId: string;
  year: number;
  quarters: Record<Quarter, { score: QuarterScore; items: TargetItem[] }>;
  /** Targets with no due date, or a due date in another year (the facts keep their bucket). */
  unscheduled: TargetItem[];
  /** Cancelled and removed targets; never scored. */
  excluded: TargetItem[];
  /** Items with rows owned by the user that are not targets, due this year or unscheduled. */
  otherWork: ItemFacts[];
  yearScore: number | null;
};

type TargetRow = { id: string; userId: string; projectId: string; itemTitle: string };
const keyOf = (projectId: string, title: string) => `${projectId}\u0000${title}`;
const dead = (f: ItemFacts) => f.state === "cancelled" || f.state === "removed";

/**
 * One pass over the data for `year`: every target of that year (all people, for the team cycle times), the rows of
 * every involved project and their events. Returns the people (`userIds`, or everyone with a target) as KPI objects.
 */
async function buildKpis(db: ScopedDb, year: number, now: Date, only?: string): Promise<PersonProjectKpi[]> {
  const targets: TargetRow[] = await db.projectKpiTarget.findMany({
    where: { year },
    select: { id: true, userId: true, projectId: true, itemTitle: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const userIds = only ? [only] : [...new Set(targets.map((t) => t.userId))];
  if (userIds.length === 0) return [];

  // Projects where these people own rows, for "other work".
  const owned = await db.projectTask.findMany({ where: { ownerId: { in: userIds } }, select: { projectId: true }, distinct: ["projectId"] });
  const projectIds = [...new Set([...targets.map((t) => t.projectId), ...owned.map((o) => o.projectId)])];

  const [projects, rowsAll] = await Promise.all([
    db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, title: true } }),
    db.projectTask.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true, projectId: true, title: true, stage: true, status: true, startDate: true, dueDate: true, ownerId: true },
      orderBy: [{ projectId: "asc" }, { position: "asc" }],
    }),
  ]);
  const eventsAll = rowsAll.length
    ? await db.projectTaskEvent.findMany({
        where: { taskId: { in: rowsAll.map((r) => r.id) } },
        select: { taskId: true, kind: true, fromValue: true, toValue: true, actorId: true, at: true },
      })
    : [];

  const projectTitle = new Map(projects.map((p) => [p.id, p.title]));
  const rowsByProject = new Map<string, (ItemRow & { projectId: string })[]>();
  for (const r of rowsAll) {
    const list = rowsByProject.get(r.projectId);
    if (list) list.push(r);
    else rowsByProject.set(r.projectId, [r]);
  }
  const projectOfRow = new Map(rowsAll.map((r) => [r.id, r.projectId]));
  const eventsByProject = new Map<string, ItemEvent[]>();
  for (const e of eventsAll) {
    const pid = projectOfRow.get(e.taskId)!;
    const list = eventsByProject.get(pid);
    if (list) list.push(e);
    else eventsByProject.set(pid, [e]);
  }

  const facts = new Map<string, ItemFacts>();
  const factsFor = (projectId: string, title: string): ItemFacts => {
    const k = keyOf(projectId, title);
    let f = facts.get(k);
    if (!f) {
      f = itemFacts({
        projectId, projectTitle: projectTitle.get(projectId) ?? "", itemTitle: title,
        projectRows: rowsByProject.get(projectId) ?? [], events: eventsByProject.get(projectId) ?? [], now,
      });
      facts.set(k, f);
    }
    return f;
  };

  // Team cycle days per quarter: every target item of the year (all people), once per project + title.
  const teamCycle: Record<Quarter, number[]> = { 1: [], 2: [], 3: [], 4: [] };
  const seen = new Set<string>();
  for (const t of targets) {
    const k = keyOf(t.projectId, t.itemTitle);
    if (seen.has(k)) continue;
    seen.add(k);
    const f = factsFor(t.projectId, t.itemTitle);
    const d = cycleDays(f);
    if (d !== null && f.bucket !== "unscheduled" && f.bucket.year === year) teamCycle[f.bucket.quarter].push(d);
  }

  return userIds.map((userId) => {
    const mine = targets.filter((t) => t.userId === userId);
    const items: Record<Quarter, TargetItem[]> = { 1: [], 2: [], 3: [], 4: [] };
    const unscheduled: TargetItem[] = [];
    const excluded: TargetItem[] = [];
    for (const t of mine) {
      const f: TargetItem = { ...factsFor(t.projectId, t.itemTitle), targetId: t.id };
      if (dead(f)) excluded.push(f);
      else if (f.bucket !== "unscheduled" && f.bucket.year === year) items[f.bucket.quarter].push(f);
      else unscheduled.push(f);
    }

    const quarters = {} as PersonProjectKpi["quarters"];
    for (const q of QUARTERS) quarters[q] = { score: scoreQuarter(items[q], teamCycle[q]), items: items[q] };

    const targetKeys = new Set(mine.map((t) => keyOf(t.projectId, t.itemTitle)));
    const otherKeys = new Map<string, { projectId: string; title: string }>();
    for (const r of rowsAll) {
      const k = keyOf(r.projectId, r.title);
      if (r.ownerId === userId && !targetKeys.has(k)) otherKeys.set(k, { projectId: r.projectId, title: r.title });
    }
    const otherWork = [...otherKeys.values()]
      .map((o) => factsFor(o.projectId, o.title))
      .filter((f) => !dead(f) && (f.bucket === "unscheduled" || f.bucket.year === year))
      .sort((a, b) => a.projectTitle.localeCompare(b.projectTitle) || a.itemTitle.localeCompare(b.itemTitle));

    return { userId, year, quarters, unscheduled, excluded, otherWork, yearScore: scoreYear(QUARTERS.map((q) => quarters[q].score)) };
  });
}

export async function loadPersonProjectKpi(db: ScopedDb, userId: string, year: number, now: Date): Promise<PersonProjectKpi> {
  const [kpi] = await buildKpis(db, year, now, userId);
  return kpi;
}

export async function loadTeamProjectKpi(db: ScopedDb, year: number, now: Date): Promise<(PersonProjectKpi & { name: string })[]> {
  const kpis = await buildKpis(db, year, now);
  if (kpis.length === 0) return [];
  const users = await db.user.findMany({ where: { id: { in: kpis.map((k) => k.userId) } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return kpis.map((k) => ({ ...k, name: names.get(k.userId) ?? "" })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Years that have targets, plus the current Jakarta year, newest first. */
export async function targetYears(db: ScopedDb): Promise<number[]> {
  const rows = await db.projectKpiTarget.findMany({ select: { year: true }, distinct: ["year"] });
  const years = new Set(rows.map((r) => r.year));
  years.add(jakartaQuarter(new Date()).year);
  return [...years].sort((a, b) => b - a);
}

/** The distinct item titles of a project with who owns rows in each, for the "add targets" picker. `year` is reserved for the UI call site. */
export async function itemOptions(
  db: ScopedDb,
  projectId: string,
  _year: number,
): Promise<{ itemTitle: string; assignedTo: { userId: string; name: string }[] }[]> {
  const rows = await db.projectTask.findMany({
    where: { projectId },
    select: { title: true, owner: { select: { id: true, name: true } } },
    orderBy: { position: "asc" },
  });
  const byTitle = new Map<string, Map<string, { userId: string; name: string }>>();
  for (const r of rows) {
    let owners = byTitle.get(r.title);
    if (!owners) byTitle.set(r.title, (owners = new Map()));
    if (r.owner) owners.set(r.owner.id, { userId: r.owner.id, name: r.owner.name });
  }
  return [...byTitle].map(([itemTitle, owners]) => ({ itemTitle, assignedTo: [...owners.values()] }));
}
