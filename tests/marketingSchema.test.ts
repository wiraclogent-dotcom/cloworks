import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { makeScoped } from "@/lib/db";
import { createTestDb, type TestDb } from "./helpers/testDb";

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe("marketing calendar schema", () => {
  let db: TestDb;
  let userId: string;
  let divisionId: string;

  beforeAll(async () => {
    db = await createTestDb();
    userId = (await db.prisma.user.create({ data: { email: "lead@clogent.co.id", name: "Lead", fullName: "Lead" } })).id;
    divisionId = (await db.prisma.division.create({ data: { name: "Digital Ads" } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  it("a new division gets the calendar defaults", async () => {
    const d = await db.prisma.division.create({ data: { name: "KOL" } });
    expect(d).toMatchObject({ color: "div-1", onMarketingCalendar: false, sortOrder: 0 });
  });

  it("stamps workspaceId on every new model and keeps calendar days as dates", async () => {
    const lead = await db.prisma.divisionLead.create({ data: { divisionId, userId } });
    const activity = await db.prisma.marketingActivity.create({
      data: { divisionId, title: "Payday flight", startDay: day("2026-10-05"), endDay: day("2026-10-09"), createdById: userId, updatedById: userId },
    });
    const month = await db.prisma.marketingMonth.create({ data: { month: "2026-10", productFocus: "Lavender 1L", updatedById: userId } });
    const notice = await db.prisma.marketingAnnouncement.create({
      data: { month: "2026-10", body: "Inbound China", startDay: day("2026-10-22"), endDay: day("2026-10-24"), createdById: userId },
    });
    for (const row of [lead, activity, month, notice]) expect(row.workspaceId).toBe(db.workspaceId);
    expect(iso(activity.startDay)).toBe("2026-10-05");
    expect(iso(activity.endDay)).toBe("2026-10-09");
    expect(activity.status).toBe("PLANNED");
    expect(iso(notice.endDay)).toBe("2026-10-24");
  });

  it("rejects the same lead twice on one division", async () => {
    await expect(db.prisma.divisionLead.create({ data: { divisionId, userId } })).rejects.toThrow();
  });

  it("rejects a second product focus row for the same month", async () => {
    await expect(db.prisma.marketingMonth.create({ data: { month: "2026-10", productFocus: "x", updatedById: userId } })).rejects.toThrow();
  });

  it("another workspace sees none of the rows", async () => {
    const other = await db.raw.workspace.create({ data: { name: "Other", slug: "other-marketing" } });
    const scoped = makeScoped(db.raw, other.id);
    expect(await scoped.marketingActivity.count()).toBe(0);
    expect(await scoped.divisionLead.count()).toBe(0);
    expect(await scoped.marketingMonth.count()).toBe(0);
    expect(await scoped.marketingAnnouncement.count()).toBe(0);
  });
});
