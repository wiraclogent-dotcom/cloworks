import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AppRole, JobRole, RequestStatus } from "@prisma/client";
import { listBriefPeople, loadBriefItems } from "@/lib/briefCalendarQueries";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("brief calendar queries", () => {
  let db: TestDb;
  const ids: Record<string, string> = {};
  let base: { brandId: string; divisionId: string };
  const types: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const mk = async (k: string, appRole: AppRole, jobRole: JobRole, active = true) => {
      ids[k] = (await p.user.create({ data: { email: `${k}@clogent.co.id`, name: k, fullName: k, appRole, jobRole, active } })).id;
    };
    await mk("rifqy", "REQUESTER", "SOCIAL_MEDIA");
    await mk("fafa", "REQUESTER", "SOCIAL_MEDIA");
    await mk("idzni", "LEAD", "SOCIAL_MEDIA");
    await mk("gone", "REQUESTER", "SOCIAL_MEDIA", false);
    await mk("des", "CREATIVE", "DESIGNER");
    const brand = await p.brand.create({ data: { name: "B" } });
    const div = await p.division.create({ data: { name: "D" } });
    base = { brandId: brand.id, divisionId: div.id };
    types.sm = (await p.requestType.create({ data: { name: "Social Media" } })).id;
    types.gd = (await p.requestType.create({ data: { name: "General Design" } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  const mkReq = async (requester: string, requestedAt: string, type: "sm" | "gd" = "sm", status: RequestStatus = "DONE") =>
    (await db.prisma.request.create({
      data: { title: `${requester} ${requestedAt}`, ...base, typeId: types[type], requesterId: ids[requester], requestedAt: new Date(requestedAt), status },
    })).id;

  it("lists active social media requesters and creatives by name, not leads, inactive people or designers", async () => {
    const people = await listBriefPeople(db.prisma);
    expect(people.map((p) => p.name)).toEqual(["fafa", "rifqy"]);
    expect(people[0]).toEqual({ id: ids.fafa, name: "fafa" });
  });

  it("loads a Jakarta month of requests from those people, any type and status", async () => {
    const first = await mkReq("fafa", "2026-09-30T17:00:00Z", "gd", "CANCELLED");
    const last = await mkReq("fafa", "2026-10-31T16:59:00Z");
    await mkReq("fafa", "2026-10-31T17:00:00Z");
    await mkReq("des", "2026-10-10T03:00:00Z");

    const people = await listBriefPeople(db.prisma);
    const items = await loadBriefItems(db.prisma, "2026-10", people);
    expect(items).toEqual([
      { id: first, title: "fafa 2026-09-30T17:00:00Z", requesterId: ids.fafa, requestDay: "2026-10-01", typeName: "General Design", status: "CANCELLED" },
      { id: last, title: "fafa 2026-10-31T16:59:00Z", requesterId: ids.fafa, requestDay: "2026-10-31", typeName: "Social Media", status: "DONE" },
    ]);
  });

  it("returns nothing when there are no people", async () => {
    expect(await loadBriefItems(db.prisma, "2026-10", [])).toEqual([]);
  });
});
