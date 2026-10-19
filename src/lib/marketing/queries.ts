import type { ScopedDb } from "../db";
import { buildMonthGrid } from "../calendar";
import { divisionTone } from "../palette";
import { dateOnly, loadLeadDivisionIds } from "./activities";
import { canManageMonth } from "./rules";
import type { CalAnnouncement, MarketingMonthData, MarketingViewer } from "./types";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Everything the Marketing Calendar page shows for one month, shaped for the client (spec 2026-10-19). */
export async function loadMarketingMonth(db: ScopedDb, viewer: MarketingViewer, month: string, today: string): Promise<MarketingMonthData> {
  const grid = buildMonthGrid(month, today);

  const divisions = await db.division.findMany({
    where: { onMarketingCalendar: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, color: true },
  });
  const divisionIds = divisions.map((d) => d.id);
  const [activities, announcements, focus, leads] = await Promise.all([
    db.marketingActivity.findMany({
      where: { divisionId: { in: divisionIds }, startDay: { lte: dateOnly(grid.to) }, endDay: { gte: dateOnly(grid.from) } },
      orderBy: [{ startDay: "asc" }, { id: "asc" }],
      select: { id: true, divisionId: true, title: true, startDay: true, endDay: true, status: true, updatedAt: true, updatedBy: { select: { name: true } } },
    }),
    db.marketingAnnouncement.findMany({
      // Dated: any that touch the grid (the Notice row covers neighbouring-month days too); the band keeps the month's.
      where: { OR: [{ startDay: null, month }, { startDay: { lte: dateOnly(grid.to) }, endDay: { gte: dateOnly(grid.from) } }] },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, body: true, startDay: true, endDay: true },
    }),
    db.marketingMonth.findFirst({ where: { month }, select: { productFocus: true } }),
    viewer.appRole === "ADMIN" ? Promise.resolve(divisionIds) : loadLeadDivisionIds(db, viewer.id),
  ]);

  const notices: CalAnnouncement[] = announcements.map((a) => ({ id: a.id, body: a.body, startDay: a.startDay ? iso(a.startDay) : null, endDay: a.endDay ? iso(a.endDay) : null }));
  const dated = notices.filter((a) => a.startDay !== null).sort((a, b) => (a.startDay! < b.startDay! ? -1 : a.startDay! > b.startDay! ? 1 : 0));
  return {
    month, today,
    divisions: divisions.map((d) => ({ id: d.id, name: d.name, tone: divisionTone(d.color) })),
    activities: activities.map((a) => ({
      id: a.id, divisionId: a.divisionId, title: a.title, startDay: iso(a.startDay), endDay: iso(a.endDay), status: a.status,
      updatedByName: a.updatedBy.name, updatedAt: a.updatedAt.toISOString(),
    })),
    announcements: [...dated, ...notices.filter((a) => a.startDay === null)],
    productFocus: focus?.productFocus ? focus.productFocus : null,
    editableDivisionIds: divisionIds.filter((id) => leads.includes(id)),
    canManageMonth: canManageMonth(viewer),
  };
}
