import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { moveRequestWith } from "@/lib/transition-action";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("moveRequestWith", () => {
  let db: TestDb;
  let creative: { id: string; appRole: "CREATIVE"; jobRole: "DESIGNER" };
  let requester: { id: string; appRole: "REQUESTER"; jobRole: "OTHER" };
  let reqId: string;
  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const c = await p.user.create({ data: { email: "c@clogent.co.id", name: "C", fullName: "C", appRole: "CREATIVE" } });
    const r = await p.user.create({ data: { email: "r@clogent.co.id", name: "R", fullName: "R" } });
    creative = { id: c.id, appRole: "CREATIVE", jobRole: "DESIGNER" };
    requester = { id: r.id, appRole: "REQUESTER", jobRole: "OTHER" };
    const brand = await p.brand.create({ data: { name: "B" } });
    const div = await p.division.create({ data: { name: "D" } });
    const type = await p.requestType.create({ data: { name: "T" } });
    reqId = (await p.request.create({ data: { title: "x", brandId: brand.id, divisionId: div.id, typeId: type.id, requesterId: r.id, status: "FIRST_LOOK" } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  it("returns FORBIDDEN as data for a requester", async () => {
    const r = await moveRequestWith(async () => requester, db.prisma, reqId, "ON_PROGRESS");
    expect(r).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
  it("returns the server message when DONE has no assignee", async () => {
    const r = await moveRequestWith(async () => creative, db.prisma, reqId, "DONE", { outputCount: 1 });
    expect(r).toEqual({ ok: false, code: "INVALID", message: "Request needs an assignee before it can be marked DONE" });
  });
  it("returns ok on a legal move and NOT_FOUND for a missing id", async () => {
    expect(await moveRequestWith(async () => creative, db.prisma, reqId, "ON_PROGRESS")).toEqual({ ok: true });
    expect(await moveRequestWith(async () => creative, db.prisma, "nope", "ON_PROGRESS")).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
  it("maps an unauthenticated caller", async () => {
    const r = await moveRequestWith(async () => { throw new Error("Unauthenticated"); }, db.prisma, reqId, "ON_PROGRESS");
    expect(r).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });
});
