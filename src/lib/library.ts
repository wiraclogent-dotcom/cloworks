import { z } from "zod";
import type { AppRole } from "@prisma/client";
import type { ScopedDb } from "./db";
import { can } from "./permissions";
import { isHttpUrl } from "./fieldSchema";
import type { LibraryRow } from "./libraryView";

export type LibraryErrorCode = "FORBIDDEN" | "VALIDATION" | "NOT_FOUND" | "CATEGORY_NOT_EMPTY";
export class LibraryError extends Error {
  constructor(public code: LibraryErrorCode, message: string, public fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "LibraryError";
  }
}

export type LibraryItemInput = {
  title: string;
  url: string;
  description?: string | null;
  categoryId: string;
  brandId?: string | null;
  pinned?: boolean;
};
export type LibraryCategoryInput = { name: string; icon?: string | null };
export type Actor = { id: string; appRole: AppRole };

const itemShape = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title must be at most 120 characters"),
  url: z.string().trim().min(1, "Link is required").max(2048, "Link must be at most 2048 characters"),
  description: z.string().trim().max(300, "Description must be at most 300 characters").nullable().optional(),
  categoryId: z.string().min(1, "Pick a category"),
  brandId: z.string().nullable().optional(),
});
const categoryShape = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Name must be at most 60 characters"),
  icon: z.string().trim().max(40, "Icon must be at most 40 characters").nullable().optional(),
});

function assertEditor(user: Actor) {
  if (!can(user.appRole, "library.manage")) throw new LibraryError("FORBIDDEN", "You are not allowed to manage the Library.");
}

function throwFields(fieldErrors: Record<string, string>): never {
  throw new LibraryError("VALIDATION", Object.values(fieldErrors)[0] ?? "Invalid input", fieldErrors);
}

function collect(r: { success: boolean; error?: z.ZodError }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!r.success) for (const i of r.error!.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
  return errors;
}

const blankToNull = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v.trim());

async function cleanItem(db: ScopedDb, input: LibraryItemInput) {
  const errors = collect(itemShape.safeParse(input));
  const title = (input.title ?? "").trim();
  const url = (input.url ?? "").trim();
  if (!errors.url && !isHttpUrl(url)) errors.url = "Link must be an http(s) link";
  const brandId = blankToNull(input.brandId);
  if (!errors.categoryId && !(await db.libraryCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } })))
    errors.categoryId = "That category does not exist";
  if (brandId && !(await db.brand.findUnique({ where: { id: brandId }, select: { id: true } })))
    errors.brandId = "That brand does not exist";
  if (Object.keys(errors).length) throwFields(errors);
  return { title, url, description: blankToNull(input.description), categoryId: input.categoryId, brandId };
}

async function requireItem(db: ScopedDb, id: string) {
  const item = await db.libraryItem.findUnique({ where: { id } });
  if (!item) throw new LibraryError("NOT_FOUND", "Link not found.");
  return item;
}
async function requireCategory(db: ScopedDb, id: string) {
  const cat = await db.libraryCategory.findUnique({ where: { id } });
  if (!cat) throw new LibraryError("NOT_FOUND", "Category not found.");
  return cat;
}

// ---- Items ---------------------------------------------------------------------------------------------------

export async function createItemWith(db: ScopedDb, user: Actor, input: LibraryItemInput): Promise<{ id: string }> {
  assertEditor(user);
  const c = await cleanItem(db, input);
  const max = await db.libraryItem.aggregate({ where: { categoryId: c.categoryId }, _max: { sortOrder: true } });
  const row = await db.libraryItem.create({
    data: { ...c, pinned: input.pinned ?? false, sortOrder: (max._max.sortOrder ?? -1) + 1, createdById: user.id, updatedById: user.id },
    select: { id: true },
  });
  return { id: row.id };
}

export async function updateItemWith(db: ScopedDb, user: Actor, id: string, input: LibraryItemInput): Promise<void> {
  assertEditor(user);
  const existing = await requireItem(db, id);
  const c = await cleanItem(db, input);
  const data: Record<string, unknown> = { ...c, updatedById: user.id, contentUpdatedAt: new Date() };
  if (input.pinned !== undefined) data.pinned = input.pinned;
  if (c.categoryId !== existing.categoryId) {
    const max = await db.libraryItem.aggregate({ where: { categoryId: c.categoryId }, _max: { sortOrder: true } });
    data.sortOrder = (max._max.sortOrder ?? -1) + 1;
  }
  await db.libraryItem.update({ where: { id }, data });
}

export async function deleteItemWith(db: ScopedDb, user: Actor, id: string): Promise<void> {
  assertEditor(user);
  await requireItem(db, id);
  await db.libraryItem.delete({ where: { id } });
}

export async function setPinnedWith(db: ScopedDb, user: Actor, id: string, pinned: boolean): Promise<void> {
  assertEditor(user);
  await requireItem(db, id);
  await db.libraryItem.update({ where: { id }, data: { pinned } });
}

export async function moveItemWith(db: ScopedDb, user: Actor, id: string, dir: "up" | "down"): Promise<void> {
  assertEditor(user);
  const item = await requireItem(db, id);
  const siblings = await db.libraryItem.findMany({
    where: { categoryId: item.categoryId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true },
  });
  await swapWithNeighbour(siblings.map((s) => s.id), id, dir, (ids) =>
    db.$transaction(ids.map((i, n) => db.libraryItem.update({ where: { id: i }, data: { sortOrder: n } }))),
  );
}

// ---- Categories ----------------------------------------------------------------------------------------------

async function checkCategory(db: ScopedDb, input: LibraryCategoryInput, selfId?: string) {
  const errors = collect(categoryShape.safeParse(input));
  const name = (input.name ?? "").trim();
  if (!errors.name) {
    const dupe = await db.libraryCategory.findFirst({ where: { name, ...(selfId ? { id: { not: selfId } } : {}) }, select: { id: true } });
    if (dupe) errors.name = "A category with that name already exists";
  }
  if (Object.keys(errors).length) throwFields(errors);
  return { name, icon: blankToNull(input.icon) };
}

const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

export async function createCategoryWith(db: ScopedDb, user: Actor, input: LibraryCategoryInput): Promise<{ id: string }> {
  assertEditor(user);
  const c = await checkCategory(db, input);
  const max = await db.libraryCategory.aggregate({ _max: { sortOrder: true } });
  try {
    const row = await db.libraryCategory.create({ data: { ...c, sortOrder: (max._max.sortOrder ?? -1) + 1 }, select: { id: true } });
    return { id: row.id };
  } catch (e) {
    if (isUniqueViolation(e)) throwFields({ name: "A category with that name already exists" });
    throw e;
  }
}

export async function updateCategoryWith(db: ScopedDb, user: Actor, id: string, input: LibraryCategoryInput): Promise<void> {
  assertEditor(user);
  await requireCategory(db, id);
  const c = await checkCategory(db, input, id);
  try {
    await db.libraryCategory.update({ where: { id }, data: c });
  } catch (e) {
    if (isUniqueViolation(e)) throwFields({ name: "A category with that name already exists" });
    throw e;
  }
}

export async function moveCategoryWith(db: ScopedDb, user: Actor, id: string, dir: "up" | "down"): Promise<void> {
  assertEditor(user);
  await requireCategory(db, id);
  const all = await db.libraryCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { id: true } });
  await swapWithNeighbour(all.map((s) => s.id), id, dir, (ids) =>
    db.$transaction(ids.map((i, n) => db.libraryCategory.update({ where: { id: i }, data: { sortOrder: n } }))),
  );
}

export async function deleteCategoryWith(db: ScopedDb, user: Actor, id: string): Promise<void> {
  assertEditor(user);
  await requireCategory(db, id);
  if ((await db.libraryItem.count({ where: { categoryId: id } })) > 0)
    throw new LibraryError("CATEGORY_NOT_EMPTY", "Move or delete its links first");
  await db.libraryCategory.delete({ where: { id } });
}

/**
 * Swaps `id` with its neighbour in `ids` (already in display order) and persists the whole order as 0..n-1 inside
 * a transaction (renumbering also heals ties). Ends are no-ops.
 */
async function swapWithNeighbour(ids: string[], id: string, dir: "up" | "down", persist: (ordered: string[]) => Promise<unknown>) {
  const i = ids.indexOf(id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  await persist(next);
}

// ---- Read ----------------------------------------------------------------------------------------------------

export async function loadLibrary(db: ScopedDb): Promise<{
  rows: LibraryRow[];
  categories: { id: string; name: string; icon: string | null }[];
  brands: { id: string; name: string }[];
}> {
  const [cats, items] = await Promise.all([
    db.libraryCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, icon: true, sortOrder: true } }),
    db.libraryItem.findMany({ include: { brand: { select: { id: true, name: true } } } }),
  ]);
  const catOrder = new Map(cats.map((c, i) => [c.id, i]));
  const sorted = [...items].sort(
    (a, b) =>
      (catOrder.get(a.categoryId) ?? 0) - (catOrder.get(b.categoryId) ?? 0) ||
      a.sortOrder - b.sortOrder ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
  const rows: LibraryRow[] = sorted.map((i) => ({
    id: i.id, title: i.title, url: i.url, description: i.description, categoryId: i.categoryId,
    brandId: i.brandId, brandName: i.brand?.name ?? null, pinned: i.pinned, sortOrder: i.sortOrder,
    createdAt: i.createdAt, contentUpdatedAt: i.contentUpdatedAt,
  }));
  const used = new Map<string, string>();
  for (const i of items) if (i.brand) used.set(i.brand.id, i.brand.name);
  const brands = [...used].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return { rows, categories: cats.map((c) => ({ id: c.id, name: c.name, icon: c.icon })), brands };
}
