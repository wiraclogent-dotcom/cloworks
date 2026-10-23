import type { ScopedDb } from "../db";
import { buildMonthGrid } from "../calendar";
import { divisionTone } from "../palette";
import { dateOnly, loadLeadDivisionIds } from "./activities";
import { canManageMonth } from "./rules";
import type { MarketingMonthData, MarketingViewer } from "./types";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Everything the Marketing Calendar page shows for one month, shaped for the client (spec 2026-10-19). */
export async function loadMarketingMonth(db: ScopedDb, viewer: MarketingViewer, month: string, today: string): Promise<MarketingMonthData> {
  const grid = buildMonthGrid(month, today);

  const divisions = await db.division.findMany({
    where: { onMarketingCalendar: true, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true },
  });
  const divisionIds = divisions.map((d) => d.id);
  const [activities, announcements, focus, leads] = await Promise.all([
    db.marketingActivity.findMany({
      where: { divisionId: { in: divisionIds }, startDay: { lte: dateOnly(grid.to) }, endDay: { gte: dateOnly(grid.from) } },
      orderBy: [{ startDay: "asc" }, { id: "asc" }],
      select: { id: true, divisionId: true, title: true, startDay: true, endDay: true, status: true, updatedAt: true, updatedBy: { select: { name: true } } },
    }),
    db.marketingAnnouncement.findMany({ where: { month }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, body: true } }),
    db.marketingMonth.findFirst({ where: { month }, select: { productFocus: true } }),
    viewer.appRole === "ADMIN" ? Promise.resolve(divisionIds) : loadLeadDivisionIds(db, viewer.id),
  ]);

  return {
    month, today,
    divisions: divisions.map((d) => ({ id: d.id, name: d.name, tone: divisionTone(d.color) })),
    activities: activities.map((a) => ({
      id: a.id, divisionId: a.divisionId, title: a.title, startDay: iso(a.startDay), endDay: iso(a.endDay), status: a.status,
      updatedByName: a.updatedBy.name, updatedAt: a.updatedAt.toISOString(),
    })),
    announcements,
    productFocus: focus?.productFocus ? focus.productFocus : null,
    editableDivisionIds: divisionIds.filter((id) => leads.includes(id)),
    canManageMonth: canManageMonth(viewer),
  };
}
