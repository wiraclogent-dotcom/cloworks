import type { PrismaClient } from "@prisma/client";
import type { BriefItem, BriefPerson } from "./briefCalendar";
import { monthBounds } from "./kpi/months";
import { jakartaDate } from "./createRequest";

/** The social media team on the brief calendar: active, not leads or admins (spec 2026-10-10). Sorted by name. */
export function listBriefPeople(db: Pick<PrismaClient, "user">): Promise<BriefPerson[]> {
  return db.user.findMany({
    where: { active: true, jobRole: "SOCIAL_MEDIA", appRole: { in: ["REQUESTER", "CREATIVE"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Every request these people submitted in the Jakarta month, any type or status, oldest first. */
export async function loadBriefItems(db: Pick<PrismaClient, "request">, month: string, people: BriefPerson[]): Promise<BriefItem[]> {
  if (people.length === 0) return [];
  const { start, end } = monthBounds(month);
  const rows = await db.request.findMany({
    where: { requesterId: { in: people.map((p) => p.id) }, requestedAt: { gte: start, lt: end } },
    orderBy: { requestedAt: "asc" },
    select: { id: true, title: true, requesterId: true, requestedAt: true, status: true, type: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id, title: r.title, requesterId: r.requesterId, requestDay: jakartaDate(r.requestedAt), typeName: r.type.name, status: r.status,
  }));
}
