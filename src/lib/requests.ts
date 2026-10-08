import type { Prisma, PrismaClient, RequestStatus } from "@prisma/client";
import { daysLeft } from "./daysLeft";
import { jakartaDate } from "./createRequest";
import { isOpenStatus } from "./reschedule";
import { BOARD_MAX_PER_COLUMN, BOARD_PAGE_SIZE, TABLE_PAGE_SIZE, pageWindow, type PageWindow } from "./paging";

export type RequestFilter = {
  status?: RequestStatus;
  assigneeId?: string;
  brandId?: string;
  divisionId?: string;
  q?: string;
  /** true = only tasks that need motion, false = only those that do not, undefined = any. */
  needsMotion?: boolean;
  mine?: { userId: string };
};

export type RequestRow = {
  id: string;
  title: string;
  brandName: string;
  divisionName: string;
  requesterName: string;
  assigneeName: string | null;
  status: RequestStatus;
  requestedAt: Date;
  deadline: Date | null;
  outputCount: number;
  needsMotion: boolean;
  /** Jakarta-calendar days to the deadline (negative = overdue), null without a deadline. */
  daysLeft: number | null;
};

const ROW_SELECT = {
  id: true, title: true, status: true, requestedAt: true, deadline: true, outputCount: true, needsMotion: true,
  brand: { select: { name: true } },
  division: { select: { name: true } },
  requester: { select: { name: true } },
  assignee: { select: { name: true } },
} satisfies Prisma.RequestSelect;

type DbRow = Prisma.RequestGetPayload<{ select: typeof ROW_SELECT }>;

function toRow(r: DbRow, now: Date): RequestRow {
  return {
    id: r.id, title: r.title, brandName: r.brand.name, divisionName: r.division.name,
    requesterName: r.requester.name, assigneeName: r.assignee?.name ?? null,
    status: r.status, requestedAt: r.requestedAt, deadline: r.deadline, outputCount: r.outputCount, needsMotion: r.needsMotion,
    daysLeft: daysLeft(r.deadline, now),
  };
}

/** The shared filter, WITHOUT the status clause (callers add it). */
function filterClauses(filter: RequestFilter): Prisma.RequestWhereInput[] {
  const and: Prisma.RequestWhereInput[] = [];
  if (filter.assigneeId) and.push({ assigneeId: filter.assigneeId });
  if (filter.brandId) and.push({ brandId: filter.brandId });
  if (filter.divisionId) and.push({ divisionId: filter.divisionId });
  if (filter.needsMotion !== undefined) and.push({ needsMotion: filter.needsMotion });
  const q = filter.q?.trim();
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { notes: { contains: q, mode: "insensitive" } }] });
  if (filter.mine) and.push({ OR: [{ requesterId: filter.mine.userId }, { assigneeId: filter.mine.userId }] });
  return and;
}

/** CANCELLED is hidden unless the status filter asks for it. */
function whereFor(filter: RequestFilter): Prisma.RequestWhereInput {
  return { AND: [filter.status ? { status: filter.status } : { status: { not: "CANCELLED" } }, ...filterClauses(filter)] };
}

const DEADLINE_ASC = { deadline: { sort: "asc", nulls: "last" } } as const;

/** Any authenticated active user may read all requests; callers must have passed requireUser(). CANCELLED is hidden unless status filters for it. */
export async function listRequests(
  db: Pick<PrismaClient, "request">,
  filter: RequestFilter = {},
  now: Date = new Date(),
): Promise<RequestRow[]> {
  const rows = await db.request.findMany({
    where: whereFor(filter),
    orderBy: [DEADLINE_ASC, { requestedAt: "desc" }, { id: "asc" }],
    select: ROW_SELECT,
  });
  return rows.map((r) => toRow(r, now));
}

export type BoardColumn = { status: RequestStatus; total: number; rows: RequestRow[] };
export type BoardLimits = { /** default rows per column (25) */ limit?: number; byStatus?: Partial<Record<RequestStatus, number>> };
const BOARD_COLUMN_ORDER: readonly RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE"];

/**
 * Board data: per column the TOTAL matching the filters plus only the first `limit` rows (never the whole table).
 * Active columns: deadline asc (nulls last), then requestedAt desc. DONE and CANCELLED: newest request first.
 * One grouped count + one bounded query per non-empty column. A status filter keeps the four columns and
 * empties the others; CANCELLED gets a fifth column only when it is the status filter.
 */
export async function listBoardColumns(
  db: Pick<PrismaClient, "request">,
  filter: RequestFilter = {},
  limits: BoardLimits = {},
  now: Date = new Date(),
): Promise<BoardColumn[]> {
  const statuses: RequestStatus[] = filter.status === "CANCELLED" ? [...BOARD_COLUMN_ORDER, "CANCELLED"] : [...BOARD_COLUMN_ORDER];
  const clauses = filterClauses(filter);
  const grouped = await db.request.groupBy({
    by: ["status"],
    where: { AND: clauses },
    _count: { _all: true },
    orderBy: { status: "asc" },
  });
  const counts = new Map(grouped.map((g) => [g.status, g._count._all]));
  return Promise.all(statuses.map(async (status): Promise<BoardColumn> => {
    const total = filter.status && filter.status !== status ? 0 : counts.get(status) ?? 0;
    const take = Math.min(BOARD_MAX_PER_COLUMN, Math.max(1, limits.byStatus?.[status] ?? limits.limit ?? BOARD_PAGE_SIZE));
    if (total === 0) return { status, total, rows: [] };
    const terminal = status === "DONE" || status === "CANCELLED";
    const rows = await db.request.findMany({
      where: { AND: [{ status }, ...clauses] },
      orderBy: terminal ? [{ requestedAt: "desc" }, { id: "asc" }] : [DEADLINE_ASC, { requestedAt: "desc" }, { id: "asc" }],
      take,
      select: ROW_SELECT,
    });
    return { status, total, rows: rows.map((r) => toRow(r, now)) };
  }));
}

export type SortKey = "title" | "brand" | "division" | "requester" | "assignee" | "status" | "requested" | "deadline";
export const SORT_KEYS: readonly SortKey[] = ["title", "brand", "division", "requester", "assignee", "status", "requested", "deadline"];
const STATUS_ORDER: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE", "CANCELLED"];

/** The row fields a sort key can read. */
export type SortFields = Pick<RequestRow, "title" | "brandName" | "divisionName" | "requesterName" | "assigneeName" | "status" | "requestedAt" | "deadline">;

/** Stable sort for the table (used for the text keys the database cannot collate like JS); nulls (no deadline / no assignee) always last regardless of direction. */
export function sortRows<T extends SortFields>(rows: T[], key: SortKey, dir: "asc" | "desc"): T[] {
  const val = (r: T): string | number | null => {
    switch (key) {
      case "title": return r.title.toLowerCase();
      case "brand": return r.brandName.toLowerCase();
      case "division": return r.divisionName.toLowerCase();
      case "requester": return r.requesterName.toLowerCase();
      case "assignee": return r.assigneeName?.toLowerCase() ?? null;
      case "status": return STATUS_ORDER.indexOf(r.status);
      case "requested": return r.requestedAt.getTime();
      case "deadline": return r.deadline?.getTime() ?? null;
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i, v: val(r) }))
    .sort((x, y) => {
      if (x.v === null && y.v === null) return x.i - y.i;
      if (x.v === null) return 1;
      if (y.v === null) return -1;
      return (x.v < y.v ? -1 : x.v > y.v ? 1 : 0) * sign || x.i - y.i;
    })
    .map((x) => x.r);
}

export type TablePage = { rows: RequestRow[]; total: number; window: PageWindow };

/**
 * One table page, sorted across the FULL filtered result before paging. Same semantics as sortRows:
 * nulls last in both directions, ties keep the default order (deadline asc nulls last, requestedAt desc).
 * deadline/requested/status sort in SQL (skip/take). Text keys keep sortRows' exact JS ordering (no collation
 * drift): only the narrow sort columns of the matching rows are read, then the page's full rows are fetched by id.
 */
export async function listRequestsPage(
  db: Pick<PrismaClient, "request">,
  filter: RequestFilter,
  opts: { sort: SortKey; dir: "asc" | "desc"; page: number; pageSize?: number },
  now: Date = new Date(),
): Promise<TablePage> {
  const where = whereFor(filter);
  const size = opts.pageSize ?? TABLE_PAGE_SIZE;
  const total = await db.request.count({ where });
  const window = pageWindow(total, opts.page, size);
  if (total === 0) return { rows: [], total, window };
  const { sort, dir } = opts;

  if (sort === "deadline" || sort === "requested" || sort === "status") {
    const orderBy: Prisma.RequestOrderByWithRelationInput[] =
      sort === "deadline" ? [{ deadline: { sort: dir, nulls: "last" } }, { requestedAt: "desc" }, { id: "asc" }]
      : sort === "requested" ? [{ requestedAt: dir }, DEADLINE_ASC, { id: "asc" }]
      : [{ status: dir }, DEADLINE_ASC, { requestedAt: "desc" }, { id: "asc" }];
    const rows = await db.request.findMany({ where, orderBy, skip: window.skip, take: size, select: ROW_SELECT });
    return { rows: rows.map((r) => toRow(r, now)), total, window };
  }

  const lean = await db.request.findMany({
    where,
    orderBy: [DEADLINE_ASC, { requestedAt: "desc" }, { id: "asc" }],
    select: {
      id: true, title: true, status: true, requestedAt: true, deadline: true,
      brand: { select: { name: true } }, division: { select: { name: true } },
      requester: { select: { name: true } }, assignee: { select: { name: true } },
    },
  });
  const sorted = sortRows(lean.map((r) => ({
    id: r.id, title: r.title, status: r.status, requestedAt: r.requestedAt, deadline: r.deadline,
    brandName: r.brand.name, divisionName: r.division.name, requesterName: r.requester.name, assigneeName: r.assignee?.name ?? null,
  })), sort, dir);
  const ids = sorted.slice(window.skip, window.skip + size).map((r) => r.id);
  const full = new Map((await db.request.findMany({ where: { id: { in: ids } }, select: ROW_SELECT })).map((r) => [r.id, r]));
  return { rows: ids.flatMap((id) => { const r = full.get(id); return r ? [toRow(r, now)] : []; }), total, window };
}

export type CalendarRow = RequestRow & { requestDay: string; deadlineDay: string | null };
const OPEN_STATUSES: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK"];

/** Jakarta midnight of a YYYY-MM-DD day, optionally shifted by whole days (UTC+7 has no DST). */
function jakartaStart(day: string, plusDays = 0): Date {
  return new Date(new Date(`${day}T00:00:00+07:00`).getTime() + plusDays * 86_400_000);
}

/**
 * Calendar data: open requests only, with a deadline in [from, to] (Jakarta days, inclusive), plus open
 * no-deadline requests when `today` falls inside the range. Ordered deadline asc (nulls last), requestedAt asc, id.
 */
export async function listCalendarRequests(
  db: Pick<PrismaClient, "request">,
  filter: RequestFilter,
  range: { from: string; to: string; today: string },
  now: Date = new Date(),
): Promise<CalendarRow[]> {
  if (filter.status && !isOpenStatus(filter.status)) return [];
  const inRange: Prisma.RequestWhereInput = { deadline: { gte: jakartaStart(range.from), lt: jakartaStart(range.to, 1) } };
  const todayShown = range.from <= range.today && range.today <= range.to;
  const rows = await db.request.findMany({
    where: {
      AND: [
        { status: filter.status ?? { in: OPEN_STATUSES } },
        todayShown ? { OR: [inRange, { deadline: null }] } : inRange,
        ...filterClauses(filter),
      ],
    },
    orderBy: [DEADLINE_ASC, { requestedAt: "asc" }, { id: "asc" }],
    select: ROW_SELECT,
  });
  return rows.map((r) => ({
    ...toRow(r, now),
    requestDay: jakartaDate(r.requestedAt),
    deadlineDay: r.deadline ? jakartaDate(r.deadline) : null,
  }));
}
