import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { submitRequestWith } from "@/lib/submitRequest";
import { CREATIVE_TEAM } from "@/lib/team";
import { seed } from "../prisma/seedCore";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let user: { id: string; appRole: "REQUESTER" };
let ids: { brand: string; division: string; general: string };
beforeAll(async () => {
  db = await createTestDb();
  await seed(db.prisma);
  user = { id: (await db.prisma.user.findFirstOrThrow({ where: { name: "Yosi" } })).id, appRole: "REQUESTER" };
  ids = {
    brand: (await db.prisma.brand.findFirstOrThrow()).id,
    division: (await db.prisma.division.findFirstOrThrow()).id,
    general: (await db.prisma.requestType.findFirstOrThrow({ where: { name: "General Design" } })).id,
  };
});
afterAll(async () => db.stop());

function fd(o: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
}

describe("submitRequestWith", () => {
  it("on validation failure echoes every submitted value, including the work kind", async () => {
    const r = await submitRequestWith(db.prisma, user, fd({
      title: "My title", briefUrl: "ftp://bad", notes: "some notes", brandId: ids.brand, divisionId: ids.division,
      deadline: "2099-01-01", workKind: "motion",
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors?.briefUrl).toBeTruthy();
    expect(r.values).toEqual({
      title: "My title", briefUrl: "ftp://bad", notes: "some notes", brandId: ids.brand, divisionId: ids.division,
      deadline: "2099-01-01", workKind: "motion", assigneeIds: [],
    });
    expect(r.nonce).toBeTruthy();
  });
  it("assigns the picked designer straight away and notifies them", async () => {
    const designer = await db.prisma.user.findFirstOrThrow({ where: { active: true, jobRole: "DESIGNER", appRole: { not: "REQUESTER" } } });
    const calls: { userIds: string[]; type: string }[] = [];
    const r = await submitRequestWith(db.prisma, user, fd({ title: "Assigned", brandId: ids.brand, divisionId: ids.division, workKind: "static", assigneeIds: designer.id }),
      async (n) => { calls.push(n); });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await db.prisma.requestAssignee.findMany({ where: { requestId: r.id } })).map((a) => a.userId)).toEqual([designer.id]);
    expect(calls).toMatchObject([{ userIds: [designer.id], type: "ASSIGNED" }]);
  });
  it("a repeated or blank assignee id gives one row and one notification", async () => {
    const designer = await db.prisma.user.findFirstOrThrow({ where: CREATIVE_TEAM });
    const calls: { userIds: string[]; type: string }[] = [];
    const r = await submitRequestWith(db.prisma, user, fd({ title: "Twice", brandId: ids.brand, divisionId: ids.division, workKind: "static", assigneeIds: [designer.id, "", designer.id] }),
      async (n) => { calls.push(n); });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await db.prisma.requestAssignee.findMany({ where: { requestId: r.id } })).toMatchObject([{ userId: designer.id }]);
    expect(calls).toMatchObject([{ userIds: [designer.id], type: "ASSIGNED" }]);
  });
  it("notifies every assignee except the person filing it", async () => {
    const [a, b] = await db.prisma.user.findMany({ where: CREATIVE_TEAM, orderBy: { name: "asc" }, take: 2 });
    const calls: { userIds: string[] }[] = [];
    const r = await submitRequestWith(db.prisma, { id: a.id, appRole: "CREATIVE" }, fd({ title: "Self", brandId: ids.brand, divisionId: ids.division, workKind: "static", assigneeIds: [a.id, b.id] }),
      async (n) => { calls.push(n); });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await db.prisma.requestAssignee.count({ where: { requestId: r.id } })).toBe(2);
    expect(calls).toMatchObject([{ userIds: [b.id] }]);
  });
  it("rejects an assignee who is not on the creative team", async () => {
    const r = await submitRequestWith(db.prisma, user, fd({ title: "Bad assignee", brandId: ids.brand, divisionId: ids.division, workKind: "static", assigneeIds: user.id }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.assigneeIds).toBe("Pick someone from the creative team");
  });
  it("static design: General Design, no motion", async () => {
    const r = await submitRequestWith(db.prisma, user, fd({ title: "T", brandId: ids.brand, divisionId: ids.division, workKind: "static" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await db.prisma.request.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ typeId: ids.general, needsMotion: false });
  });
  it("design + motion: General Design with needsMotion, ignoring a posted typeId or f_ fields", async () => {
    const other = (await db.prisma.requestType.findFirstOrThrow({ where: { name: "Social Media" } })).id;
    const r = await submitRequestWith(db.prisma, user, fd({ title: "T2", brandId: ids.brand, divisionId: ids.division, workKind: "motion", typeId: other, f_platform: "TikTok" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await db.prisma.request.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ typeId: ids.general, needsMotion: true, fields: {} });
  });
  it("video edit only: Motion Support with needsMotion", async () => {
    const motion = (await db.prisma.requestType.findFirstOrThrow({ where: { name: "Motion Support" } })).id;
    const r = await submitRequestWith(db.prisma, user, fd({ title: "T3", brandId: ids.brand, divisionId: ids.division, workKind: "video" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await db.prisma.request.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ typeId: motion, needsMotion: true });
  });
  it("a missing or unknown work kind is a field error reported together with the other errors, and nothing is created", async () => {
    const before = await db.prisma.request.count();
    for (const workKind of [undefined, "maybe"]) {
      const r = await submitRequestWith(db.prisma, user, fd({ title: "", brandId: ids.brand, divisionId: ids.division, ...(workKind ? { workKind } : {}) }));
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.fieldErrors).toMatchObject({ workKind: "Pick what you need", title: expect.any(String) });
      expect(r.fieldErrors?.typeId).toBeUndefined();
      expect(r.values.workKind).toBe("");
    }
    expect(await db.prisma.request.count()).toBe(before);
  });
});
