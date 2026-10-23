import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { brandOptions, divisionOptions, visibleOptions } from "@/lib/lists";

describe("pickers for new work", () => {
  let db: TestDb;
  let active: string, archived: string, kept: string;
  beforeAll(async () => {
    db = await createTestDb();
    active = (await db.prisma.brand.create({ data: { name: "Clogent" } })).id;
    archived = (await db.prisma.brand.create({ data: { name: "Nuvie", archivedAt: new Date() } })).id;
    kept = (await db.prisma.brand.create({ data: { name: "Clenvo", archivedAt: new Date() } })).id;
    await db.prisma.division.create({ data: { name: "Ecommerce" } });
    await db.prisma.division.create({ data: { name: "Old Team", archivedAt: new Date() } });
  });
  afterAll(async () => { await db?.stop(); });

  it("brands: active ones, plus archived ones a record still uses, labelled", async () => {
    expect(await brandOptions(db.prisma)).toEqual([{ id: active, name: "Clogent", archived: false }]);
    expect(await brandOptions(db.prisma, [kept, null])).toEqual([
      { id: kept, name: "Clenvo (archived)", archived: true },
      { id: active, name: "Clogent", archived: false },
    ]);
    expect((await brandOptions(db.prisma, [kept])).map((b) => b.id)).not.toContain(archived);
  });

  it("divisions: active only", async () => {
    expect((await divisionOptions(db.prisma)).map((d) => d.name)).toEqual(["Ecommerce"]);
  });

  it("a form shows an archived option only when it is the record's current value", () => {
    const opts = [{ id: "a", name: "A", archived: false }, { id: "x", name: "X (archived)", archived: true }];
    expect(visibleOptions(opts, null).map((o) => o.id)).toEqual(["a"]);
    expect(visibleOptions(opts, "x").map((o) => o.id)).toEqual(["a", "x"]);
  });
});
