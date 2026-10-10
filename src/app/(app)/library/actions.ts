"use server";

import { revalidatePath } from "next/cache";
import { dbFor, requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import {
  LibraryError, createItemWith, updateItemWith, deleteItemWith, setPinnedWith, moveItemWith,
  createCategoryWith, updateCategoryWith, moveCategoryWith, deleteCategoryWith,
  type LibraryErrorCode, type LibraryItemInput, type LibraryCategoryInput, type Actor,
} from "@/lib/library";
import type { ScopedDb } from "@/lib/db";

export type LibraryActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: LibraryErrorCode | "UNAUTHENTICATED"; message: string; fieldErrors?: Record<string, string> };

function failure(e: unknown): { ok: false; code: LibraryErrorCode; message: string; fieldErrors?: Record<string, string> } {
  if (e instanceof LibraryError) return { ok: false, code: e.code, message: e.message, fieldErrors: e.fieldErrors };
  throw e;
}

/** Shared wrapper: auth, scoped db, result-object errors (Next redacts thrown errors in production), revalidate. */
function run<T extends object>(fn: (db: ScopedDb, user: Actor) => Promise<T | void>): Promise<LibraryActionResult<T>> {
  return withUser<LibraryActionResult<T>, LibraryActionResult<T>>(requireUser, async (user) => {
    try {
      const r = await fn(dbFor(user), user);
      revalidatePath("/library");
      return { ok: true, ...(r ?? {}) } as LibraryActionResult<T>;
    } catch (e) {
      return failure(e);
    }
  }, unauthResult);
}

export async function createItem(input: LibraryItemInput): Promise<LibraryActionResult<{ id: string }>> {
  return run((db, u) => createItemWith(db, u, input));
}
export async function updateItem(id: string, input: LibraryItemInput): Promise<LibraryActionResult> {
  return run((db, u) => updateItemWith(db, u, id, input));
}
export async function deleteItem(id: string): Promise<LibraryActionResult> {
  return run((db, u) => deleteItemWith(db, u, id));
}
export async function setPinned(id: string, pinned: boolean): Promise<LibraryActionResult> {
  return run((db, u) => setPinnedWith(db, u, id, pinned));
}
export async function moveItem(id: string, dir: "up" | "down"): Promise<LibraryActionResult> {
  return run((db, u) => moveItemWith(db, u, id, dir));
}
export async function createCategory(input: LibraryCategoryInput): Promise<LibraryActionResult<{ id: string }>> {
  return run((db, u) => createCategoryWith(db, u, input));
}
export async function updateCategory(id: string, input: LibraryCategoryInput): Promise<LibraryActionResult> {
  return run((db, u) => updateCategoryWith(db, u, id, input));
}
export async function moveCategory(id: string, dir: "up" | "down"): Promise<LibraryActionResult> {
  return run((db, u) => moveCategoryWith(db, u, id, dir));
}
export async function deleteCategory(id: string): Promise<LibraryActionResult> {
  return run((db, u) => deleteCategoryWith(db, u, id));
}
