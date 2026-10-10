import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { submitRequestWith } from "@/lib/submitRequest";
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

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
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
      deadline: "2099-01-01", workKind: "motion",
    });
    expect(r.nonce).toBeTruthy();
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
