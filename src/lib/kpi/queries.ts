import type { JobRole, PrismaClient, RequestStatus } from "@prisma/client";
import type { KpiRequest } from "./metrics";
import type { KpiPost } from "./contentMetrics";
import { ASSIGNEE_ORDER } from "../assignees";
import { monthBounds } from "./months";

const OPEN: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK"];

/**
 * Requests whose Jakarta month of requestedAt is in `months`, plus every currently open request
 * of any month (needed for active workload), each with its status events.
 */
export async function loadKpiRequests(db: PrismaClient, months: string[]): Promise<KpiRequest[]> {
  const ranges = months.map((m) => {
    const { start, end } = monthBounds(m);
    return { requestedAt: { gte: start, lt: end } };
  });
  const rows = await db.request.findMany({
    where: { OR: [...ranges, { status: { in: OPEN } }] },
    select: {
      id: true, requesterId: true, requestedAt: true, deadline: true, originalDeadline: true, status: true,
      includeKpi: true, outputCount: true,
      assignees: { select: { userId: true }, orderBy: [...ASSIGNEE_ORDER] },
      statusEvents: { select: { from: true, to: true, at: true }, orderBy: { at: "asc" } },
    },
  });
  return rows.map(({ statusEvents, assignees, ...r }) => ({ ...r, assigneeIds: assignees.map((a) => a.userId), events: statusEvents }));
}

/** Planned Content Plan posts approved within `months` (Jakarta), optionally of some authors only: the social media KPI. */
export async function loadKpiPosts(db: PrismaClient, months: string[], authorIds?: string[]): Promise<KpiPost[]> {
  const ranges = months.map((m) => {
    const { start, end } = monthBounds(m);
    return { approvedAt: { gte: start, lt: end } };
  });
  return db.contentPost.findMany({
    where: { kind: "PLANNED", OR: ranges, ...(authorIds ? { authorId: { in: authorIds } } : {}) },
    select: { id: true, authorId: true, approvedAt: true, plannedAt: true },
  });
}

export type TargetRow = { userId: string; month: string; role: JobRole; targetTasks: number; note: string | null };

export async function loadTargets(db: PrismaClient, months: string[], userId?: string): Promise<TargetRow[]> {
  return db.kpiTarget.findMany({
    where: { month: { in: months }, ...(userId ? { userId } : {}) },
    select: { userId: true, month: true, role: true, targetTasks: true, note: true },
  });
}
