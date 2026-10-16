import type { PrismaClient } from "@prisma/client";
import type { BriefItem } from "./briefCalendar";
import { monthBounds } from "./kpi/months";
import { jakartaDate } from "./createRequest";

/** Every request type in the workspace (active or not), by name: the fixed order that gives each type its chart colour. */
export async function loadTypeOrder(db: Pick<PrismaClient, "requestType">): Promise<string[]> {
  const types = await db.requestType.findMany({ select: { name: true }, orderBy: { name: "asc" } });
  return types.map((t) => t.name);
}

/** Every request anyone submitted in the Jakarta month, any type or status, oldest first (spec 2026-10-10, updated). */
export async function loadBriefItems(db: Pick<PrismaClient, "request">, month: string): Promise<BriefItem[]> {
  const { start, end } = monthBounds(month);
  const rows = await db.request.findMany({
    where: { requestedAt: { gte: start, lt: end } },
    orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
    select: { id: true, title: true, requesterId: true, requestedAt: true, status: true, type: { select: { name: true } }, requester: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id, title: r.title, requesterId: r.requesterId, requesterName: r.requester.name ?? "Unknown", requestDay: jakartaDate(r.requestedAt), typeName: r.type.name, status: r.status,
  }));
}
