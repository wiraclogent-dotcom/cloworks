import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppRole } from "@prisma/client";
import { deleteActivityWith, loadLeadDivisionIds, saveActivityWith } from "@/lib/marketing/activities";
import { deleteAnnouncementWith, saveAnnouncementWith, saveProductFocusWith } from "@/lib/marketing/month";
import { MarketingError } from "@/lib/marketing/errors";
import type { MarketingViewer } from "@/lib/marketing/types";
import { createTestDb, type TestDb } from "./helpers/testDb";

const codeOf = async (p: Promise<unknown>) => { try { await p; } catch (e) { expect(e).toBeInstanceOf(MarketingError); return (e as MarketingError).code; } throw new Error("did not reject"); };

describe("marketing writes", () => {
  let db: TestDb;
  const v: Record<string, MarketingViewer> = {};
  const div: Record<string, string> = {};
  const input = (divisionId: string, over: object = {}) => ({ title: "KOL unboxing", divisionId, startDay: "2026-10-25", endDay: "2026-10-30", status: "CONFIRMED", ...over });

  beforeAll(async () => {
    db = await createTestDb();
    const mk = async (k: string, appRole: AppRole) => { v[k] = { id: (await db.prisma.user.create({ data: { email: `${k}@clogent.co.id`, name: k, fullName: k, appRole } })).id, appRole }; };
    await mk("admin", "ADMIN"); await mk("kolLead", "REQUESTER"); await mk("lead", "LEAD");
    for (const [k, name, on] of [["kol", "KOL", true], ["ads", "Digital Ads", true], ["creative", "Creative", false]] as const)
      div[k] = (await db.prisma.division.create({ data: { name, onMarketingCalendar: on } })).id;
    await db.prisma.divisionLead.create({ data: { divisionId: div.kol, userId: v.kolLead.id } });
  });
  afterAll(async () => { await db?.stop(); });

  it("finds the divisions someone leads", async () => {
    expect(await loadLeadDivisionIds(db.prisma, v.kolLead.id)).toEqual([div.kol]);
    expect(await loadLeadDivisionIds(db.prisma, v.lead.id)).toEqual([]);
  });

  it("a KOL lead (requester) creates a KOL activity stamped with their id", async () => {
    const { id } = await saveActivityWith(db.prisma, v.kolLead, null, input(div.kol));
    const row = await db.prisma.marketingActivity.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ title: "KOL unboxing", status: "CONFIRMED", createdById: v.kolLead.id, updatedById: v.kolLead.id });
    expect(row.startDay.toISOString().slice(0, 10)).toBe("2026-10-25");
  });

  it("the KOL lead cannot touch a Digital Ads activity; an admin can", async () => {
    const { id } = await saveActivityWith(db.prisma, v.admin, null, input(div.ads, { title: "Payday flight" }));
    expect(await codeOf(saveActivityWith(db.prisma, v.kolLead, id, input(div.ads)))).toBe("FORBIDDEN");
    expect(await codeOf(saveActivityWith(db.prisma, v.kolLead, id, input(div.kol)))).toBe("FORBIDDEN"); // moving it into KOL needs Digital Ads too
    expect(await codeOf(deleteActivityWith(db.prisma, v.kolLead, id))).toBe("FORBIDDEN");
    expect(await db.prisma.marketingActivity.count({ where: { id } })).toBe(1);
    await saveActivityWith(db.prisma, v.admin, id, input(div.ads, { title: "Payday flight Meta" }));
    expect((await db.prisma.marketingActivity.findUniqueOrThrow({ where: { id } })).updatedById).toBe(v.admin.id);
  });

  it("appRole LEAD without a lead link is refused", async () => {
    expect(await codeOf(saveActivityWith(db.prisma, v.lead, null, input(div.kol)))).toBe("FORBIDDEN");
  });

  it("a division off the calendar is refused with a field error", async () => {
    try { await saveActivityWith(db.prisma, v.admin, null, input(div.creative)); throw new Error("did not reject"); }
    catch (e) { expect((e as MarketingError).fieldErrors).toEqual({ divisionId: "This division is not on the Marketing Calendar." }); }
  });

  it("invalid input is refused before anything else", async () => {
    expect(await codeOf(saveActivityWith(db.prisma, v.kolLead, null, input(div.kol, { title: "" })))).toBe("INVALID");
  });

  it("unknown ids are not found", async () => {
    expect(await codeOf(saveActivityWith(db.prisma, v.admin, "nope", input(div.kol)))).toBe("NOT_FOUND");
    expect(await codeOf(deleteActivityWith(db.prisma, v.admin, "nope"))).toBe("NOT_FOUND");
    expect(await codeOf(deleteAnnouncementWith(db.prisma, v.admin, "nope"))).toBe("NOT_FOUND");
  });

  it("the lead deletes their own activity", async () => {
    const { id } = await saveActivityWith(db.prisma, v.kolLead, null, input(div.kol));
    await deleteActivityWith(db.prisma, v.kolLead, id);
    expect(await db.prisma.marketingActivity.count({ where: { id } })).toBe(0);
  });

  it("only an admin sets the product focus; saving twice keeps one row", async () => {
    expect(await codeOf(saveProductFocusWith(db.prisma, v.lead, "2026-10", "x"))).toBe("FORBIDDEN");
    await saveProductFocusWith(db.prisma, v.admin, "2026-10", "Lavender 1L");
    await saveProductFocusWith(db.prisma, v.admin, "2026-10", "  Lavender 1L + refill ");
    const rows = await db.prisma.marketingMonth.findMany({ where: { month: "2026-10" } });
    expect(rows.map((r) => [r.productFocus, r.updatedById])).toEqual([["Lavender 1L + refill", v.admin.id]]);
    expect(await codeOf(saveProductFocusWith(db.prisma, v.admin, "2026-13", "x"))).toBe("INVALID");
  });

  it("an admin creates, edits and deletes an announcement; others cannot", async () => {
    const a = { month: "2026-10", body: "Inbound China", startDay: "2026-10-22", endDay: "2026-10-24" };
    expect(await codeOf(saveAnnouncementWith(db.prisma, v.kolLead, null, a))).toBe("FORBIDDEN");
    const { id } = await saveAnnouncementWith(db.prisma, v.admin, null, a);
    await saveAnnouncementWith(db.prisma, v.admin, id, { ...a, body: "Inbound China (Pitbond)" });
    const row = await db.prisma.marketingAnnouncement.findUniqueOrThrow({ where: { id } });
    expect([row.body, row.month, row.createdById]).toEqual(["Inbound China (Pitbond)", "2026-10", v.admin.id]);
    expect(await codeOf(deleteAnnouncementWith(db.prisma, v.lead, id))).toBe("FORBIDDEN");
    await deleteAnnouncementWith(db.prisma, v.admin, id);
    expect(await db.prisma.marketingAnnouncement.count({ where: { id } })).toBe(0);
  });
});
