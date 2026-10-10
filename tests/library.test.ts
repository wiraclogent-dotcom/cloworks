import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { STARTER_CATEGORIES } from "../prisma/seedCore";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("library schema", () => {
  let db: TestDb;
  let userId: string;
  beforeAll(async () => {
    db = await createTestDb();
    userId = (await db.prisma.user.create({ data: { email: "l@clogent.co.id", name: "L", fullName: "L", appRole: "ADMIN" } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  const item = (categoryId: string, brandId?: string) => db.prisma.libraryItem.create({
    data: { title: "T", url: "https://x.test", categoryId, brandId, createdById: userId, updatedById: userId },
  });

  it("migration seeds the starter categories for the existing workspace", async () => {
    const cats = await db.prisma.libraryCategory.findMany({ orderBy: { sortOrder: "asc" } });
    expect(cats.map((c) => c.name)).toEqual([...STARTER_CATEGORIES]);
  });

  it("stamps the scoped workspace on created items", async () => {
    const [cat] = await db.prisma.libraryCategory.findMany();
    const created = await item(cat.id);
    expect(created.workspaceId).toBe(db.workspaceId);
  });

  it("sets brandId to null when the brand is deleted", async () => {
    const [cat] = await db.prisma.libraryCategory.findMany();
    const brand = await db.prisma.brand.create({ data: { name: "Lib Brand" } });
    const created = await item(cat.id, brand.id);
    await db.prisma.brand.delete({ where: { id: brand.id } });
    expect((await db.prisma.libraryItem.findUniqueOrThrow({ where: { id: created.id } })).brandId).toBeNull();
  });

  it("refuses to delete a category that still has items", async () => {
    const cat = await db.prisma.libraryCategory.create({ data: { name: "Busy" } });
    await item(cat.id);
    await expect(db.prisma.libraryCategory.delete({ where: { id: cat.id } })).rejects.toThrow();
  });
});
