import type { ProjectStage, ProjectStatus, ProjectTaskEventKind } from "@prisma/client";
import { isTaskDone, PROJECT_STAGES, taskMode } from "@/lib/projectProgress";
import { jakartaDay, jakartaIso } from "@/lib/projectTasks";
import { JAKARTA_OFFSET_MS } from "./workingDays";

// Pure: turns one project item's rows + change events into the facts the KPI scoring consumes. No database access.

const DAY_MS = 86_400_000;
const SLIP_WINDOW_MS = 60_000;

export type Quarter = 1 | 2 | 3 | 4;

/** The Jakarta calendar quarter an instant falls in. */
export function jakartaQuarter(d: Date): { year: number; quarter: Quarter } {
  const j = new Date(d.getTime() + JAKARTA_OFFSET_MS);
  return { year: j.getUTCFullYear(), quarter: (Math.floor(j.getUTCMonth() / 3) + 1) as Quarter };
}

/** Jakarta-midnight start of the quarter and of the next one (the end is exclusive). */
export function quarterBounds(year: number, q: Quarter): { start: Date; end: Date } {
  const at = (y: number, month: number) => new Date(Date.UTC(y, month, 1) - JAKARTA_OFFSET_MS);
  const startMonth = (q - 1) * 3;
  return { start: at(year, startMonth), end: at(year, startMonth + 3) };
}

export type ItemRow = {
  id: string;
  title: string;
  stage: ProjectStage | null;
  status: ProjectStatus | null;
  startDate: Date | null;
  dueDate: Date | null;
  ownerId: string | null;
};
export type ItemEvent = {
  taskId: string;
  kind: ProjectTaskEventKind;
  fromValue: string | null;
  toValue: string | null;
  actorId: string;
  at: Date;
};

export type ItemState = "done" | "finishedUntracked" | "open" | "cancelled" | "removed";
export type ItemFacts = {
  projectId: string;
  projectTitle: string;
  itemTitle: string;
  state: ItemState;
  /** Latest dueDate of the live rows. */
  dueDate: Date | null;
  bucket: { year: number; quarter: Quarter } | "unscheduled";
  startAt: Date | null;
  finishAt: Date | null;
  /** 0..1 */
  progress: number;
  /** null = not judged yet (open, not overdue) or untracked. */
  onTime: boolean | null;
  revisions: number;
  slips: number;
};

// CANCELLED is a project-level status; a task row can't be set to it, so this entry only keeps the record total.
const STATUS_PROGRESS: Record<ProjectStatus, number> = { NOT_STARTED: 0, IN_PROGRESS: 0.5, IN_REVIEW: 0.8, ON_HOLD: 0.5, DONE: 1, CANCELLED: 0 };
const stageIndex = (s: string | null) => (s ? PROJECT_STAGES.indexOf(s as ProjectStage) : -1);

/** The end of the Jakarta calendar day the instant is on (23:59:59.999). */
const endOfJakartaDay = (d: Date) => new Date(jakartaDay(jakartaIso(d)).getTime() + DAY_MS - 1);

function rowProgress(r: ItemRow, mode: "stage" | "status"): number {
  if (mode === "status") return r.status ? STATUS_PROGRESS[r.status] : 0;
  const i = stageIndex(r.stage);
  return i < 0 ? 0 : i / 5;
}

function countRevisions(events: ItemEvent[], mode: "stage" | "status"): number {
  let n = 0;
  for (const e of events) {
    if (e.kind === "STAGE" && mode === "stage") {
      if (!e.fromValue || !e.toValue || e.fromValue === "CANCELLED" || e.toValue === "CANCELLED") continue;
      const from = stageIndex(e.fromValue);
      const to = stageIndex(e.toValue);
      if (from >= 0 && to >= 0 && to < from) n++;
    } else if (e.kind === "STATUS" && mode === "status") {
      if ((e.fromValue === "DONE" || e.fromValue === "IN_REVIEW") && (e.toValue === "IN_PROGRESS" || e.toValue === "NOT_STARTED")) n++;
    }
  }
  return n;
}

/** Due-date pushes, with rows moved together (same actor, each within 60 s of the previous push in the group) counted once. */
function countSlips(events: ItemEvent[]): number {
  const pushes = events
    .filter((e) => e.kind === "DUE" && e.fromValue && e.toValue && e.toValue > e.fromValue)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  let groups = 0;
  let last: ItemEvent | null = null;
  for (const e of pushes) {
    const joins = last !== null && e.actorId === last.actorId && e.at.getTime() - last.at.getTime() <= SLIP_WINDOW_MS;
    if (!joins) groups++;
    last = e;
  }
  return groups;
}

export function itemFacts(input: {
  projectId: string;
  projectTitle: string;
  itemTitle: string;
  projectRows: ItemRow[];
  events: ItemEvent[];
  now: Date;
}): ItemFacts {
  const { projectId, projectTitle, itemTitle, projectRows, events, now } = input;
  const base = { projectId, projectTitle, itemTitle };
  const mode = taskMode(projectRows);
  const itemRows = projectRows.filter((r) => r.title === itemTitle);
  const live = itemRows.filter((r) => r.stage !== "CANCELLED");

  // Events of the item's live rows; a fully cancelled item still counts its own rows' history.
  const ids = new Set((live.length > 0 ? live : itemRows).map((r) => r.id));
  const itemEvents = events.filter((e) => ids.has(e.taskId));
  const revisions = countRevisions(itemEvents, mode);
  const slips = countSlips(itemEvents);

  if (live.length === 0) {
    return {
      ...base, state: itemRows.length === 0 ? "removed" : "cancelled", dueDate: null, bucket: "unscheduled",
      startAt: null, finishAt: null, progress: 0, onTime: null, revisions, slips,
    };
  }

  let dueDate: Date | null = null;
  let startDate: Date | null = null;
  for (const r of live) {
    if (r.dueDate && (!dueDate || r.dueDate > dueDate)) dueDate = r.dueDate;
    if (r.startDate && (!startDate || r.startDate < startDate)) startDate = r.startDate;
  }

  let startAt = startDate;
  if (!startAt) {
    for (const e of itemEvents) {
      if (e.kind !== "STAGE" && e.kind !== "STATUS") continue;
      if (e.fromValue !== null && e.fromValue !== "NOT_STARTED") continue;
      if (e.toValue === null || e.toValue === "NOT_STARTED") continue; // must move OFF NOT_STARTED
      if (!startAt || e.at < startAt) startAt = e.at;
    }
  }

  const progress = live.reduce((sum, r) => sum + rowProgress(r, mode), 0) / live.length;

  const doneKind: ProjectTaskEventKind = mode === "status" ? "STATUS" : "STAGE";
  const doneValue = mode === "status" ? "DONE" : "FINAL_ARTWORK";
  let state: ItemState = "open";
  let finishAt: Date | null = null;
  if (live.every((r) => isTaskDone(r, mode))) {
    // Every row is done: finishAt is the latest done event of any row. Only when no row has one is it untracked.
    for (const e of itemEvents) {
      if (e.kind === doneKind && e.toValue === doneValue && (!finishAt || e.at > finishAt)) finishAt = e.at;
    }
    state = finishAt ? "done" : "finishedUntracked";
  }

  const dueEnd = dueDate ? endOfJakartaDay(dueDate) : null;
  let onTime: boolean | null = null;
  if (dueEnd) {
    if (state === "done" && finishAt) onTime = finishAt <= dueEnd;
    else if (state === "open" && now > dueEnd) onTime = false;
  }

  return {
    ...base, state, dueDate, bucket: dueDate ? jakartaQuarter(dueDate) : "unscheduled",
    startAt, finishAt, progress, onTime, revisions, slips,
  };
}
