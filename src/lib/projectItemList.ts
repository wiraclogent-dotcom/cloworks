import type { ProjectStage, ProjectStatus } from "@prisma/client";
import { PROJECT_STAGES, isTaskDone, taskMode, type TaskMode } from "./projectProgress";
import { TASK_STATUS_ORDER, jakartaIso } from "./projectTasks";

// Groups a project's rows (ProjectTask) into items for the project page's item list, and picks the items that need
// attention. Pure: no database access. Not to be confused with kpi/projectItems.ts (KPI item facts).

/** URL-safe slug of an item title: lowercase ASCII, diacritics stripped, runs of anything else become "-". Falls back
 *  to "item"; a slug already in `taken` gets -2, -3, ... and the result is added to `taken`. */
export function itemSlug(title: string, taken: Set<string>): string {
  const base =
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "item";
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  taken.add(slug);
  return slug;
}

export type ItemRowInput = {
  id: string;
  title: string;
  subTitle: string | null;
  position: number;
  ownerId: string | null;
  ownerName: string | null;
  stage: ProjectStage | null;
  status: ProjectStatus | null;
  startDate: Date | null;
  dueDate: Date | null;
  dueTbc: boolean;
};

export type ProjectItem = {
  title: string;
  slug: string;
  /** Rows in position order. */
  rows: ItemRowInput[];
  /** Rows that are not canceled. */
  liveRows: ItemRowInput[];
  allCancelled: boolean;
  /** Every live row is done (and there is at least one). */
  done: boolean;
  /** Latest live due date; `dueTbc` when no live row has a date and any live row is marked TBC. */
  dueDate: Date | null;
  dueTbc: boolean;
  /** Distinct owner names of live rows, in row order. */
  owners: string[];
  /** Live rows per stage (stage mode) or status (status mode), in sheet order, zeros dropped, "none" last. */
  counts: { key: ProjectStage | ProjectStatus | "none"; n: number }[];
};

/** One item per sheet title, in the order the titles first appear by position. */
export function groupItems(rows: ItemRowInput[], mode: TaskMode = taskMode(rows)): ProjectItem[] {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const byTitle = new Map<string, ItemRowInput[]>();
  for (const r of sorted) {
    const list = byTitle.get(r.title);
    if (list) list.push(r);
    else byTitle.set(r.title, [r]);
  }

  const order: (ProjectStage | ProjectStatus)[] = mode === "status" ? TASK_STATUS_ORDER : PROJECT_STAGES;
  const taken = new Set<string>();
  return [...byTitle].map(([title, itemRows]) => {
    const liveRows = itemRows.filter((r) => r.stage !== "CANCELLED");

    let dueDate: Date | null = null;
    for (const r of liveRows) if (r.dueDate && (!dueDate || r.dueDate > dueDate)) dueDate = r.dueDate;

    const owners: string[] = [];
    for (const r of liveRows) if (r.ownerName && !owners.includes(r.ownerName)) owners.push(r.ownerName);

    const tally = new Map<ProjectStage | ProjectStatus | "none", number>();
    for (const r of liveRows) {
      const key = (mode === "status" ? r.status : r.stage) ?? "none";
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    const counts = [...order, "none" as const].flatMap((key) => (tally.get(key) ? [{ key, n: tally.get(key)! }] : []));

    return {
      title,
      slug: itemSlug(title, taken),
      rows: itemRows,
      liveRows,
      allCancelled: liveRows.length === 0,
      done: liveRows.length > 0 && liveRows.every((r) => isTaskDone(r, mode)),
      dueDate,
      dueTbc: dueDate === null && liveRows.some((r) => r.dueTbc),
      owners,
      counts,
    };
  });
}

/** Items not done that are overdue or due within 7 Jakarta days of `now`: overdue first (oldest due first), then soonest due. */
export function needsAttention(items: ProjectItem[], now: Date): { item: ProjectItem; overdue: boolean }[] {
  const today = jakartaIso(now);
  const horizon = jakartaIso(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  return items
    .flatMap((item) => {
      if (item.done || item.allCancelled || !item.dueDate) return [];
      const day = jakartaIso(item.dueDate);
      return day <= horizon ? [{ item, day, overdue: day < today }] : [];
    })
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
    .map(({ item, overdue }) => ({ item, overdue }));
}
