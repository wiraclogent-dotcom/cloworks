import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("test database helper", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db?.stop();
  });

  it("creates a Brand row and reads it back", async () => {
    const created = await db.prisma.brand.create({ data: { name: "Clogent" } });
    const found = await db.prisma.brand.findUnique({ where: { id: created.id } });
    expect(found?.name).toBe("Clogent");
  });
});
