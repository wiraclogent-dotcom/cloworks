import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { submitRequestWith } from "@/lib/submitRequest";
import { seed } from "../prisma/seedCore";
import { createTestDb, type TestDb } from "./helpers/testDb";

let db: TestDb;
let user: { id: string; appRole: "REQUESTER" };
let ids: { brand: string; division: string; social: string };
beforeAll(async () => {
  db = await createTestDb();
  await seed(db.prisma);
  user = { id: (await db.prisma.user.findFirstOrThrow({ where: { name: "Yosi" } })).id, appRole: "REQUESTER" };
  ids = {
    brand: (await db.prisma.brand.findFirstOrThrow()).id,
    division: (await db.prisma.division.findFirstOrThrow()).id,
    social: (await db.prisma.requestType.findFirstOrThrow({ where: { name: "Social Media" } })).id,
  };
});
afterAll(async () => db.stop());

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("submitRequestWith", () => {
  it("on validation failure echoes every submitted value, including detail fields", async () => {
    const r = await submitRequestWith(db.prisma, user, fd({
      title: "My title", briefUrl: "ftp://bad", notes: "some notes", brandId: ids.brand, divisionId: ids.division,
      typeId: ids.social, deadline: "2099-01-01", f_platform: "TikTok", f_shooting: "on", f_publishedUrl: "https://x.co",
    }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors?.briefUrl).toBeTruthy();
    expect(r.values).toEqual({
      title: "My title", briefUrl: "ftp://bad", notes: "some notes", brandId: ids.brand, divisionId: ids.division,
      typeId: ids.social, deadline: "2099-01-01",
      fields: { platform: "TikTok", shooting: true, publishedUrl: "https://x.co" },
    });
    expect(r.nonce).toBeTruthy();
  });
  it("returns ok with id on success", async () => {
    const r = await submitRequestWith(db.prisma, user, fd({
      title: "T", brandId: ids.brand, divisionId: ids.division, typeId: ids.social, f_platform: "Instagram", f_contentType: "Daily",
    }));
    expect(r.ok).toBe(true);
  });
});
