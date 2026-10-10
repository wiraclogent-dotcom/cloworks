import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { STARTER_CATEGORIES } from "../prisma/seedCore";
import { createTestDb, type TestDb } from "./helpers/testDb";
import {
  LibraryError, createItemWith, updateItemWith, deleteItemWith, setPinnedWith, moveItemWith,
  createCategoryWith, updateCategoryWith, moveCategoryWith, deleteCategoryWith,
} from "@/lib/library";

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

type Role = "REQUESTER" | "CREATIVE" | "LEAD" | "ADMIN";

describe("library cores", () => {
  let db: TestDb;
  let userId: string, catA: string, catB: string, brandId: string;
  let foreignCat: string, foreignBrand: string;
  const actor = (appRole: Role) => ({ id: userId, appRole });
  const lead = () => actor("LEAD");
  const base = () => ({ title: "Doc", url: "https://drive.google.com/x", categoryId: catA });
  const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof LibraryError ? e.code : `other:${e}`));
  const getItem = (id: string) => db.prisma.libraryItem.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    db = await createTestDb();
    userId = (await db.prisma.user.create({ data: { email: "c@clogent.co.id", name: "C", fullName: "C", appRole: "LEAD" } })).id;
    catA = (await db.prisma.libraryCategory.create({ data: { name: "Cores A", sortOrder: 100 } })).id;
    catB = (await db.prisma.libraryCategory.create({ data: { name: "Cores B", sortOrder: 101 } })).id;
    brandId = (await db.prisma.brand.create({ data: { name: "Cores Brand" } })).id;
    const ws = await db.raw.workspace.create({ data: { name: "Other", slug: "other-lib" } });
    foreignCat = (await db.raw.libraryCategory.create({ data: { name: "Foreign", workspaceId: ws.id } })).id;
    foreignBrand = (await db.raw.brand.create({ data: { name: "Foreign Brand", workspaceId: ws.id } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  it("rejects non-editors on every write", async () => {
    const { id } = await createItemWith(db.prisma, lead(), base());
    const cat = await db.prisma.libraryCategory.create({ data: { name: "Forbid" } });
    for (const role of ["REQUESTER", "CREATIVE"] as const) {
      const a = actor(role);
      const calls = [
        createItemWith(db.prisma, a, base()),
        updateItemWith(db.prisma, a, id, base()),
        deleteItemWith(db.prisma, a, id),
        setPinnedWith(db.prisma, a, id, true),
        moveItemWith(db.prisma, a, id, "up"),
        createCategoryWith(db.prisma, a, { name: "Nope" }),
        updateCategoryWith(db.prisma, a, cat.id, { name: "Nope" }),
        moveCategoryWith(db.prisma, a, cat.id, "up"),
        deleteCategoryWith(db.prisma, a, cat.id),
      ];
      for (const c of calls) expect(await code(c)).toBe("FORBIDDEN");
    }
  });

  it("validates title, url and description together", async () => {
    const err = await createItemWith(db.prisma, lead(), { ...base(), title: " ", url: "javascript:alert(1)", description: "x".repeat(301) }).catch((e) => e);
    expect(err).toBeInstanceOf(LibraryError);
    expect(err.code).toBe("VALIDATION");
    expect(Object.keys(err.fieldErrors).sort()).toEqual(["description", "title", "url"]);
    const ftp = await createItemWith(db.prisma, lead(), { ...base(), url: "ftp://x" }).catch((e) => e);
    expect(Object.keys(ftp.fieldErrors)).toEqual(["url"]);
  });

  it("trims and accepts mixed-case https", async () => {
    const { id } = await createItemWith(db.prisma, lead(), { ...base(), title: "  T  ", url: "  HTTPS://Drive.google.com/x ", description: " d " });
    const row = await getItem(id);
    expect(row.url).toBe("HTTPS://Drive.google.com/x");
    expect(row.title).toBe("T");
    expect(row.description).toBe("d");
    expect(row.createdById).toBe(userId);
  });

  it("rejects unknown or foreign category and brand", async () => {
    for (const [categoryId, brand] of [["nope", "nope"], [foreignCat, foreignBrand]] as const) {
      const err = await createItemWith(db.prisma, lead(), { ...base(), categoryId, brandId: brand }).catch((e) => e);
      expect(err.code).toBe("VALIDATION");
      expect(Object.keys(err.fieldErrors).sort()).toEqual(["brandId", "categoryId"]);
    }
    expect(await code(createItemWith(db.prisma, lead(), { ...base(), brandId }))).toBe("ok");
  });

  it("pin and move leave contentUpdatedAt alone; edit bumps it", async () => {
    const { id } = await createItemWith(db.prisma, lead(), { ...base(), categoryId: catB });
    const before = (await getItem(id)).contentUpdatedAt;
    await new Promise((r) => setTimeout(r, 15));
    await setPinnedWith(db.prisma, lead(), id, true);
    await moveItemWith(db.prisma, lead(), id, "up");
    const pinned = await getItem(id);
    expect(pinned.pinned).toBe(true);
    expect(pinned.contentUpdatedAt.getTime()).toBe(before.getTime());
    await updateItemWith(db.prisma, lead(), id, { ...base(), categoryId: catB, title: "Renamed" });
    const edited = await getItem(id);
    expect(edited.title).toBe("Renamed");
    expect(edited.contentUpdatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("move is a no-op at the ends and swaps neighbours", async () => {
    const cat = (await db.prisma.libraryCategory.create({ data: { name: "Order" } })).id;
    const mk = async (title: string) => (await createItemWith(db.prisma, lead(), { ...base(), title, categoryId: cat })).id;
    const [a, b, c] = [await mk("a"), await mk("b"), await mk("c")];
    const order = async () => (await db.prisma.libraryItem.findMany({ where: { categoryId: cat }, orderBy: { sortOrder: "asc" } })).map((i) => i.id);
    expect(await order()).toEqual([a, b, c]);
    await moveItemWith(db.prisma, lead(), a, "up");
    await moveItemWith(db.prisma, lead(), c, "down");
    expect(await order()).toEqual([a, b, c]);
    await moveItemWith(db.prisma, lead(), a, "down");
    expect(await order()).toEqual([b, a, c]);
    await moveItemWith(db.prisma, lead(), c, "up");
    expect(await order()).toEqual([b, c, a]);
  });

  it("moves categories", async () => {
    const x = (await createCategoryWith(db.prisma, lead(), { name: "Move X", icon: "star" })).id;
    const y = (await createCategoryWith(db.prisma, lead(), { name: "Move Y" })).id;
    const order = async () => (await db.prisma.libraryCategory.findMany({ orderBy: { sortOrder: "asc" } })).map((c) => c.id);
    await moveCategoryWith(db.prisma, lead(), y, "down");
    const o0 = await order();
    expect(o0.slice(-2)).toEqual([x, y]);
    await moveCategoryWith(db.prisma, lead(), y, "up");
    expect((await order()).slice(-2)).toEqual([y, x]);
    await updateCategoryWith(db.prisma, lead(), x, { name: "Move X2", icon: null });
    expect((await db.prisma.libraryCategory.findUniqueOrThrow({ where: { id: x } })).name).toBe("Move X2");
  });

  it("deleteCategory refuses a non-empty category", async () => {
    const full = (await db.prisma.libraryCategory.create({ data: { name: "Full" } })).id;
    await createItemWith(db.prisma, lead(), { ...base(), categoryId: full });
    const err = await deleteCategoryWith(db.prisma, lead(), full).catch((e) => e);
    expect(err.code).toBe("CATEGORY_NOT_EMPTY");
    expect(err.message).toBe("Move or delete its links first");
    const empty = (await db.prisma.libraryCategory.create({ data: { name: "Empty" } })).id;
    await deleteCategoryWith(db.prisma, lead(), empty);
    expect(await db.prisma.libraryCategory.findUnique({ where: { id: empty } })).toBeNull();
  });

  it("rejects a duplicate category name", async () => {
    await createCategoryWith(db.prisma, lead(), { name: "Dupe" });
    const err = await createCategoryWith(db.prisma, lead(), { name: " Dupe " }).catch((e) => e);
    expect(err.code).toBe("VALIDATION");
    expect(err.fieldErrors).toHaveProperty("name");
    const other = (await createCategoryWith(db.prisma, lead(), { name: "Dupe2" })).id;
    const err2 = await updateCategoryWith(db.prisma, lead(), other, { name: "Dupe" }).catch((e) => e);
    expect(err2.fieldErrors).toHaveProperty("name");
    expect(await code(updateCategoryWith(db.prisma, lead(), other, { name: "Dupe2", icon: "x" }))).toBe("ok");
  });

  it("returns NOT_FOUND for unknown ids", async () => {
    expect(await code(updateItemWith(db.prisma, lead(), "nope", base()))).toBe("NOT_FOUND");
    expect(await code(deleteItemWith(db.prisma, lead(), "nope"))).toBe("NOT_FOUND");
    expect(await code(setPinnedWith(db.prisma, lead(), "nope", true))).toBe("NOT_FOUND");
    expect(await code(moveItemWith(db.prisma, lead(), "nope", "up"))).toBe("NOT_FOUND");
    expect(await code(updateCategoryWith(db.prisma, lead(), "nope", { name: "Z" }))).toBe("NOT_FOUND");
    expect(await code(moveCategoryWith(db.prisma, lead(), "nope", "up"))).toBe("NOT_FOUND");
    expect(await code(deleteCategoryWith(db.prisma, lead(), "nope"))).toBe("NOT_FOUND");
  });

  it("deleteItem removes the row", async () => {
    const { id } = await createItemWith(db.prisma, lead(), base());
    await deleteItemWith(db.prisma, lead(), id);
    expect(await db.prisma.libraryItem.findUnique({ where: { id } })).toBeNull();
  });
});
