import type { Prisma } from "@prisma/client";
import type { JSONContent } from "@tiptap/core";
import type { ScopedDb } from "../db";
import { EMPTY_NOTE_DOC, noteSummary, notePreview, parseNoteDoc } from "./doc";
import { NoteError } from "./errors";

/**
 * Notes cores (spec 2026-10-23). Every read and write is confined to the owner (`userId`): another person's note or
 * folder behaves exactly like a missing one.
 */

/** "all", "deleted" (Recently Deleted) or one of the owner's folder ids. */
export type NoteView = "all" | "deleted" | (string & {});
export type NoteRow = { id: string; title: string; preview: string; updatedAt: Date; deletedAt: Date | null; pinned: boolean; folderName: string | null };
export type NoteDetail = { id: string; body: JSONContent; title: string; pinned: boolean; folderId: string | null; deletedAt: Date | null; updatedAt: Date };

export const NOTE_PURGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const notFound = () => new NoteError("NOT_FOUND", "Note not found");

async function ownNote(db: ScopedDb, userId: string, id: string) {
  const note = await db.note.findFirst({ where: { id, userId } });
  if (!note) throw notFound();
  return note;
}

async function ownLiveNote(db: ScopedDb, userId: string, id: string) {
  const note = await ownNote(db, userId, id);
  if (note.deletedAt) throw new NoteError("DELETED", "This note is in Recently Deleted. Restore it first.");
  return note;
}

/** Throws NOT_FOUND unless `folderId` is null or one of the owner's folders. */
async function assertOwnFolder(db: ScopedDb, userId: string, folderId: string | null) {
  if (folderId === null) return;
  if (!(await db.noteFolder.findFirst({ where: { id: folderId, userId }, select: { id: true } }))) throw new NoteError("NOT_FOUND", "Folder not found");
}

/** `contains` takes LIKE wildcards: escape them so a search matches its text literally. */
const literal = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listNotes(db: ScopedDb, userId: string, { view, q }: { view: NoteView; q?: string }): Promise<NoteRow[]> {
  const where: Prisma.NoteWhereInput = { userId };
  if (view === "deleted") where.deletedAt = { not: null };
  else {
    where.deletedAt = null;
    if (view !== "all") where.folderId = view;
  }
  const text = q?.trim();
  if (text) {
    const contains = literal(text);
    where.OR = [{ title: { contains, mode: "insensitive" } }, { text: { contains, mode: "insensitive" } }];
  }
  const rows = await db.note.findMany({
    where,
    orderBy: view === "deleted" ? [{ deletedAt: "desc" }] : [{ pinned: "desc" }, { updatedAt: "desc" }],
    select: { id: true, title: true, text: true, updatedAt: true, deletedAt: true, pinned: true, folder: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id, title: r.title, preview: notePreview(r.text), updatedAt: r.updatedAt, deletedAt: r.deletedAt, pinned: r.pinned,
    folderName: r.folder?.name ?? null,
  }));
}

export async function getNote(db: ScopedDb, userId: string, id: string): Promise<NoteDetail | null> {
  const n = await db.note.findFirst({ where: { id, userId } });
  if (!n) return null;
  return { id: n.id, body: n.body as JSONContent, title: n.title, pinned: n.pinned, folderId: n.folderId, deletedAt: n.deletedAt, updatedAt: n.updatedAt };
}

/** Deletes the owner's notes that have been in Recently Deleted for more than 30 days. */
export async function purgeExpiredNotes(db: ScopedDb, userId: string, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - NOTE_PURGE_DAYS * DAY_MS);
  return (await db.note.deleteMany({ where: { userId, deletedAt: { lt: cutoff } } })).count;
}

export async function createNoteWith(db: ScopedDb, userId: string, folderId: string | null): Promise<{ id: string }> {
  await assertOwnFolder(db, userId, folderId);
  return db.note.create({ data: { userId, folderId, body: EMPTY_NOTE_DOC as Prisma.InputJsonObject }, select: { id: true } });
}

export async function saveNoteWith(db: ScopedDb, userId: string, id: string, body: unknown): Promise<{ title: string; preview: string; updatedAt: Date }> {
  const doc = parseNoteDoc(body);
  await ownLiveNote(db, userId, id);
  const { title, text } = noteSummary(doc);
  const saved = await db.note.update({ where: { id }, data: { body: doc.toJSON(), title, text }, select: { updatedAt: true } });
  return { title, preview: notePreview(text), updatedAt: saved.updatedAt };
}

/** Pinning and moving are not edits: the note keeps its edited time (and its place among unpinned notes). */
export async function setPinnedWith(db: ScopedDb, userId: string, id: string, pinned: boolean): Promise<void> {
  const note = await ownLiveNote(db, userId, id);
  await db.note.update({ where: { id }, data: { pinned, updatedAt: note.updatedAt } });
}

export async function moveNoteWith(db: ScopedDb, userId: string, id: string, folderId: string | null): Promise<void> {
  const note = await ownLiveNote(db, userId, id);
  await assertOwnFolder(db, userId, folderId);
  await db.note.update({ where: { id }, data: { folderId, updatedAt: note.updatedAt } });
}

/** To Recently Deleted; a note with no text at all is deleted for good instead (as Apple Notes does). */
export async function deleteNoteWith(db: ScopedDb, userId: string, id: string): Promise<{ purged: boolean }> {
  const note = await ownNote(db, userId, id);
  if (note.title === "" && note.text.trim() === "") {
    await db.note.delete({ where: { id } });
    return { purged: true };
  }
  if (!note.deletedAt) {
    await db.note.update({
      where: { id },
      data: { deletedAt: new Date(), deletedFromFolderId: note.folderId, folderId: null, pinned: false, updatedAt: note.updatedAt },
    });
  }
  return { purged: false };
}

/** Back to the folder it came from while that folder still exists, else to no folder. */
export async function restoreNoteWith(db: ScopedDb, userId: string, id: string): Promise<{ folderId: string | null }> {
  const note = await ownNote(db, userId, id);
  const from = note.deletedFromFolderId;
  const folderId = from && (await db.noteFolder.findFirst({ where: { id: from, userId }, select: { id: true } })) ? from : null;
  await db.note.update({ where: { id }, data: { deletedAt: null, deletedFromFolderId: null, folderId, updatedAt: note.updatedAt } });
  return { folderId };
}

export async function deleteNoteNowWith(db: ScopedDb, userId: string, id: string): Promise<void> {
  const note = await ownNote(db, userId, id);
  if (!note.deletedAt) throw new NoteError("VALIDATION", "Only notes in Recently Deleted can be deleted for good.");
  await db.note.delete({ where: { id } });
}

export async function emptyDeletedWith(db: ScopedDb, userId: string): Promise<number> {
  return (await db.note.deleteMany({ where: { userId, deletedAt: { not: null } } })).count;
}
