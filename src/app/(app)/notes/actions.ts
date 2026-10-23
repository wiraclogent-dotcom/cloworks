"use server";

import { revalidatePath } from "next/cache";
import { dbFor, requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import type { ScopedDb } from "@/lib/db";
import { NoteError, type NoteErrorCode } from "@/lib/notes/errors";
import {
  createFolderWith, createNoteWith, deleteFolderWith, deleteNoteNowWith, deleteNoteWith, emptyDeletedWith, moveNoteWith,
  renameFolderWith, restoreNoteWith, saveNoteWith, setPinnedWith,
} from "@/lib/notes/notes";

/** Server actions can be called with anything: ids and names must be strings, pins booleans, folder ids a string or null. */
function check(ok: boolean) {
  if (!ok) throw new NoteError("VALIDATION", "Invalid request");
}
const isStr = (v: unknown): v is string => typeof v === "string";
const ids = (...vs: unknown[]) => check(vs.every(isStr));
const folderRef = (v: unknown) => check(v === null || isStr(v));

export type NotesActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: NoteErrorCode | "UNAUTHENTICATED"; message: string };

/**
 * Shared wrapper: auth, scoped db, result-object errors (Next redacts thrown errors in production). Every action but
 * saveNote and createNote revalidates /notes so the folder and note lists come back fresh; saves run every second while
 * typing, and a new note is opened by navigating to it.
 */
function run<T extends object>(fn: (db: ScopedDb, userId: string) => Promise<T | void>, revalidate = true): Promise<NotesActionResult<T>> {
  return withUser<NotesActionResult<T>, NotesActionResult<T>>(requireUser, async (user) => {
    try {
      const r = await fn(dbFor(user), user.id);
      if (revalidate) revalidatePath("/notes");
      return { ok: true, ...(r ?? {}) } as NotesActionResult<T>;
    } catch (e) {
      if (e instanceof NoteError) return { ok: false, code: e.code, message: e.message };
      throw e;
    }
  }, unauthResult);
}

export async function createNote(folderId: string | null): Promise<NotesActionResult<{ id: string }>> {
  // No revalidate: that would re-render the URL being left, whose load cleans up empty notes (this one included).
  return run((db, u) => { folderRef(folderId); return createNoteWith(db, u, folderId); }, false);
}
export async function saveNote(id: string, body: unknown): Promise<NotesActionResult<{ title: string; preview: string; updatedAt: Date }>> {
  return run((db, u) => { ids(id); return saveNoteWith(db, u, id, body); }, false);
}
export async function setNotePinned(id: string, pinned: boolean): Promise<NotesActionResult> {
  return run((db, u) => { ids(id); check(typeof pinned === "boolean"); return setPinnedWith(db, u, id, pinned); });
}
export async function moveNote(id: string, folderId: string | null): Promise<NotesActionResult> {
  return run((db, u) => { ids(id); folderRef(folderId); return moveNoteWith(db, u, id, folderId); });
}
export async function deleteNote(id: string): Promise<NotesActionResult<{ purged: boolean }>> {
  return run((db, u) => { ids(id); return deleteNoteWith(db, u, id); });
}
export async function restoreNote(id: string): Promise<NotesActionResult<{ folderId: string | null }>> {
  return run((db, u) => { ids(id); return restoreNoteWith(db, u, id); });
}
export async function deleteNoteNow(id: string): Promise<NotesActionResult> {
  return run((db, u) => { ids(id); return deleteNoteNowWith(db, u, id); });
}
export async function emptyDeleted(): Promise<NotesActionResult> {
  return run(async (db, u) => { await emptyDeletedWith(db, u); });
}
export async function createFolder(name: string): Promise<NotesActionResult<{ id: string }>> {
  return run((db, u) => { ids(name); return createFolderWith(db, u, name); });
}
export async function renameFolder(id: string, name: string): Promise<NotesActionResult> {
  return run((db, u) => { ids(id, name); return renameFolderWith(db, u, id, name); });
}
export async function deleteFolder(id: string): Promise<NotesActionResult> {
  return run(async (db, u) => { ids(id); await deleteFolderWith(db, u, id); });
}
