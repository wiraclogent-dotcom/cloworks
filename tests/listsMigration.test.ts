import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";

// The migration keeps today's badge colours: Clogent and Bubble Wash were hard-coded in brandTone (case- and
// whitespace-insensitive); every other brand was grey.
describe("lists archive and colour migration", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb({ upTo: "20261023040118_notes" });
    // By SQL: the generated client already knows the columns this migration adds.
    const ws = db.workspaceId;
    await db.raw.$executeRaw`INSERT INTO "Brand" ("id", "name", "workspaceId") VALUES ('b1', 'Clogent', ${ws}), ('b2', ' bubble  WASH ', ${ws}), ('b3', 'Clenvo', ${ws})`;
    await db.raw.$executeRaw`INSERT INTO "Division" ("id", "name", "workspaceId") VALUES ('d1', 'KOL', ${ws})`;
    await db.migrate();
  });
  afterAll(async () => { await db?.stop(); });

  it("fills brand colours from today's look and leaves everything active", async () => {
    const brands = await db.raw.brand.findMany();
    expect(Object.fromEntries(brands.map((b) => [b.name, [b.color, b.archivedAt]]))).toEqual({
      Clogent: ["tag-clogent", null],
      " bubble  WASH ": ["tag-bubble-wash", null],
      Clenvo: ["tag-neutral", null],
    });
    expect((await db.raw.division.findMany()).map((d) => d.archivedAt)).toEqual([null]);
  });
});
