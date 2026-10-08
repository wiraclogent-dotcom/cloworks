import type { JobRole, PrismaClient, RequestStatus } from "@prisma/client";
import type { KpiRequest } from "./metrics";
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
      id: true, requesterId: true, assigneeId: true, requestedAt: true, deadline: true, originalDeadline: true, status: true,
      includeKpi: true, outputCount: true,
      statusEvents: { select: { from: true, to: true, at: true }, orderBy: { at: "asc" } },
    },
  });
  return rows.map(({ statusEvents, ...r }) => ({ ...r, events: statusEvents }));
}

export type TargetRow = { userId: string; month: string; role: JobRole; targetTasks: number; note: string | null };

export async function loadTargets(db: PrismaClient, months: string[], userId?: string): Promise<TargetRow[]> {
  return db.kpiTarget.findMany({
    where: { month: { in: months }, ...(userId ? { userId } : {}) },
    select: { userId: true, month: true, role: true, targetTasks: true, note: true },
  });
}
