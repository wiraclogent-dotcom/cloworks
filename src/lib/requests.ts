import type { Prisma, PrismaClient, RequestStatus } from "@prisma/client";
import { daysLeft } from "./daysLeft";

export type RequestFilter = {
  status?: RequestStatus;
  assigneeId?: string;
  brandId?: string;
  divisionId?: string;
  q?: string;
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
  /** Jakarta-calendar days to the deadline (negative = overdue), null without a deadline. */
  daysLeft: number | null;
};

/** Any authenticated active user may read all requests; callers must have passed requireUser(). CANCELLED is hidden unless status filters for it. */
export async function listRequests(
  db: Pick<PrismaClient, "request">,
  filter: RequestFilter = {},
  now: Date = new Date(),
): Promise<RequestRow[]> {
  const and: Prisma.RequestWhereInput[] = [];
  if (filter.status) and.push({ status: filter.status });
  else and.push({ status: { not: "CANCELLED" } });
  if (filter.assigneeId) and.push({ assigneeId: filter.assigneeId });
  if (filter.brandId) and.push({ brandId: filter.brandId });
  if (filter.divisionId) and.push({ divisionId: filter.divisionId });
  const q = filter.q?.trim();
  if (q) and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { notes: { contains: q, mode: "insensitive" } }] });
  if (filter.mine) and.push({ OR: [{ requesterId: filter.mine.userId }, { assigneeId: filter.mine.userId }] });

  const rows = await db.request.findMany({
    where: { AND: and },
    orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { requestedAt: "desc" }],
    select: {
      id: true, title: true, status: true, requestedAt: true, deadline: true, outputCount: true,
      brand: { select: { name: true } },
      division: { select: { name: true } },
      requester: { select: { name: true } },
      assignee: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id, title: r.title, brandName: r.brand.name, divisionName: r.division.name,
    requesterName: r.requester.name, assigneeName: r.assignee?.name ?? null,
    status: r.status, requestedAt: r.requestedAt, deadline: r.deadline, outputCount: r.outputCount,
    daysLeft: daysLeft(r.deadline, now),
  }));
}

export type SortKey = "title" | "brand" | "division" | "requester" | "assignee" | "status" | "requested" | "deadline";
export const SORT_KEYS: readonly SortKey[] = ["title", "brand", "division", "requester", "assignee", "status", "requested", "deadline"];
const STATUS_ORDER: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE", "CANCELLED"];

/** Stable client-facing sort for the table; nulls (no deadline / no assignee) always last regardless of direction. */
export function sortRows(rows: RequestRow[], key: SortKey, dir: "asc" | "desc"): RequestRow[] {
  const val = (r: RequestRow): string | number | null => {
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
