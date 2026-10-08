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
  it("on validation failure echoes every submitted value, including the motion choice", async () => {
    const r = await submitRequestWith(db.prisma, user, fd({
      title: "My title", briefUrl: "ftp://bad", notes: "some notes", brandId: ids.brand, divisionId: ids.division,
      deadline: "2099-01-01", needsMotion: "yes",
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors?.briefUrl).toBeTruthy();
    expect(r.values).toEqual({
      title: "My title", briefUrl: "ftp://bad", notes: "some notes", brandId: ids.brand, divisionId: ids.division,
      deadline: "2099-01-01", needsMotion: true,
    });
    expect(r.nonce).toBeTruthy();
  });
  it("returns ok with id on success; the request gets the default type and needsMotion=false when the radio says no", async () => {
    const r = await submitRequestWith(db.prisma, user, fd({ title: "T", brandId: ids.brand, divisionId: ids.division, needsMotion: "no" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await db.prisma.request.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ typeId: ids.general, needsMotion: false });
  });
  it("stores needsMotion=true for 'yes' and ignores a posted typeId or f_ fields (the form no longer sends them)", async () => {
    const other = (await db.prisma.requestType.findFirstOrThrow({ where: { name: "Social Media" } })).id;
    const r = await submitRequestWith(db.prisma, user, fd({ title: "T2", brandId: ids.brand, divisionId: ids.division, needsMotion: "yes", typeId: other, f_platform: "TikTok" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await db.prisma.request.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ typeId: ids.general, needsMotion: true, fields: {} });
  });
  it("treats a missing or unknown radio value as no", async () => {
    const r = await submitRequestWith(db.prisma, user, fd({ title: "T3", brandId: ids.brand, divisionId: ids.division, needsMotion: "maybe" }));
    expect(r.ok && (await db.prisma.request.findUniqueOrThrow({ where: { id: r.id } })).needsMotion).toBe(false);
  });
});
