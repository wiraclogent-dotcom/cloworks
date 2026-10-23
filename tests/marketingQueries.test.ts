import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppRole } from "@prisma/client";
import { loadMarketingMonth } from "@/lib/marketing/queries";
import type { MarketingViewer } from "@/lib/marketing/types";
import { createTestDb, type TestDb } from "./helpers/testDb";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe("loadMarketingMonth", () => {
  let db: TestDb;
  const v: Record<string, MarketingViewer> = {};
  const div: Record<string, string> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const mk = async (k: string, appRole: AppRole) => { v[k] = { id: (await p.user.create({ data: { email: `${k}@clogent.co.id`, name: k, fullName: k, appRole } })).id, appRole }; };
    await mk("admin", "ADMIN"); await mk("kolLead", "REQUESTER"); await mk("member", "CREATIVE");
    const mkDiv = async (k: string, name: string, sortOrder: number, onMarketingCalendar = true, color = "div-1") =>
      (div[k] = (await p.division.create({ data: { name, sortOrder, onMarketingCalendar, color } })).id);
    await mkDiv("social", "Social Media", 4, true, "div-4");
    await mkDiv("kol", "KOL", 3, true, "div-3");
    await mkDiv("ads", "Digital Ads", 2, true, "div-2");
    await mkDiv("brand", "Brand", 2, true, "div-1"); // ties with Digital Ads: name breaks it
    await mkDiv("creative", "Creative", 0, false);
    await p.divisionLead.create({ data: { divisionId: div.kol, userId: v.kolLead.id } });
    await p.divisionLead.create({ data: { divisionId: div.creative, userId: v.kolLead.id } });
    const act = async (k: string, divisionId: string, s: string, e: string) =>
      (ids[k] = (await p.marketingActivity.create({ data: { divisionId, title: k, startDay: day(s), endDay: day(e), status: "CONFIRMED", createdById: v.admin.id, updatedById: v.kolLead.id } })).id);
    await act("fromSeptember", div.ads, "2026-09-28", "2026-10-03");
    await act("trailing", div.kol, "2026-11-01", "2026-11-01");
    await act("november", div.kol, "2026-11-10", "2026-11-12");
    await act("offCalendar", div.creative, "2026-10-10", "2026-10-10");
    await act("mid", div.brand, "2026-10-05", "2026-10-09");
    const notice = async (k: string, month: string, s: string | null, e: string | null) =>
      (ids[k] = (await p.marketingAnnouncement.create({ data: { month, body: k, startDay: s ? day(s) : null, endDay: e ? day(e) : null, createdById: v.admin.id } })).id);
    await notice("undatedOct", "2026-10", null, null);
    await notice("undatedNov", "2026-11", null, null);
    await notice("crossing", "2026-10", "2026-10-30", "2026-11-02");
    await notice("inbound", "2026-10", "2026-10-22", "2026-10-24");
    await notice("novFirst", "2026-11", "2026-11-01", "2026-11-02"); // 1 Nov is a trailing day of October's grid
    await p.marketingMonth.create({ data: { month: "2026-10", productFocus: "Lavender 1L", updatedById: v.admin.id } });
    await p.marketingMonth.create({ data: { month: "2026-12", productFocus: "", updatedById: v.admin.id } });
  });
  afterAll(async () => { await db?.stop(); });

  it("lists calendar divisions by order then name, with their tones", async () => {
    const m = await loadMarketingMonth(db.prisma, v.member, "2026-10", "2026-10-19");
    expect(m.divisions.map((d) => [d.name, d.tone])).toEqual([["Brand", "div-1"], ["Digital Ads", "div-2"], ["KOL", "div-3"], ["Social Media", "div-4"]]);
    expect(m).toMatchObject({ month: "2026-10", today: "2026-10-19" });
  });

  it("returns activities overlapping the grid, including neighbouring-month days", async () => {
    const m = await loadMarketingMonth(db.prisma, v.member, "2026-10", "2026-10-19");
    expect(m.activities.map((a) => a.title)).toEqual(["fromSeptember", "mid", "trailing"]);
    expect(m.activities[0]).toMatchObject({ divisionId: div.ads, startDay: "2026-09-28", endDay: "2026-10-03", status: "CONFIRMED", updatedByName: "kolLead" });
    expect(typeof m.activities[0].updatedAt).toBe("string");
  });

  it("lists only the month's own announcements, oldest first, ignoring dates left from before they were monthly", async () => {
    const oct = await loadMarketingMonth(db.prisma, v.member, "2026-10", "2026-10-19");
    expect(oct.announcements.map((a) => a.body)).toEqual(["undatedOct", "crossing", "inbound"]);
    expect(oct.announcements[2]).toEqual({ id: ids.inbound, body: "inbound" });
    const nov = await loadMarketingMonth(db.prisma, v.member, "2026-11", "2026-10-19");
    expect(nov.announcements.map((a) => a.body)).toEqual(["undatedNov", "novFirst"]);
  });

  it("returns the product focus, null when missing or cleared", async () => {
    expect((await loadMarketingMonth(db.prisma, v.member, "2026-10", "2026-10-19")).productFocus).toBe("Lavender 1L");
    expect((await loadMarketingMonth(db.prisma, v.member, "2026-11", "2026-10-19")).productFocus).toBeNull();
    expect((await loadMarketingMonth(db.prisma, v.member, "2026-12", "2026-10-19")).productFocus).toBeNull();
  });

  it("gives each viewer the divisions they may edit", async () => {
    const lead = await loadMarketingMonth(db.prisma, v.kolLead, "2026-10", "2026-10-19");
    expect(lead.editableDivisionIds).toEqual([div.kol]); // Creative is off the calendar
    expect(lead.canManageMonth).toBe(false);
    const admin = await loadMarketingMonth(db.prisma, v.admin, "2026-10", "2026-10-19");
    expect(admin.editableDivisionIds).toEqual([div.brand, div.ads, div.kol, div.social]);
    expect(admin.canManageMonth).toBe(true);
    expect((await loadMarketingMonth(db.prisma, v.member, "2026-10", "2026-10-19")).editableDivisionIds).toEqual([]);
  });

  it("an archived division leaves the calendar lanes", async () => {
    await db.prisma.division.create({ data: { name: "Archived Lane", sortOrder: 1, onMarketingCalendar: true, color: "div-5", archivedAt: new Date() } });
    const m = await loadMarketingMonth(db.prisma, v.member, "2026-10", "2026-10-19");
    expect(m.divisions.map((d) => d.name)).not.toContain("Archived Lane");
  });
});
