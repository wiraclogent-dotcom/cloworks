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

/**
 * Runs when the owner opens Notes: deletes notes that have been in Recently Deleted for more than 30 days, and empty
 * notes left behind (a new note whose tab was closed before anything was typed), except `keepId`, the one being opened.
 */
export async function purgeExpiredNotes(db: ScopedDb, userId: string, now: Date, keepId: string | null = null): Promise<number> {
  const cutoff = new Date(now.getTime() - NOTE_PURGE_DAYS * DAY_MS);
  const empty: Prisma.NoteWhereInput = { title: "", text: "", ...(keepId ? { id: { not: keepId } } : {}) };
  return (await db.note.deleteMany({ where: { userId, OR: [{ deletedAt: { lt: cutoff } }, empty] } })).count;
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

export type FolderRow = { id: string; name: string; count: number };
export type NotesSidebar = { folders: FolderRow[]; allCount: number; deletedCount: number };

const FOLDER_NAME_MAX = 60;

/** The owner's folders A–Z (ignoring case) with their live note counts, plus the All Notes and Recently Deleted counts. */
export async function listFolders(db: ScopedDb, userId: string): Promise<NotesSidebar> {
  const [folders, counts, allCount, deletedCount] = await Promise.all([
    db.noteFolder.findMany({ where: { userId }, select: { id: true, name: true } }),
    db.note.groupBy({ by: ["folderId"], where: { userId, deletedAt: null, folderId: { not: null } }, _count: { _all: true } }),
    db.note.count({ where: { userId, deletedAt: null } }),
    db.note.count({ where: { userId, deletedAt: { not: null } } }),
  ]);
  const byFolder = new Map(counts.map((c) => [c.folderId, c._count._all]));
  return {
    folders: folders
      .map((f) => ({ id: f.id, name: f.name, count: byFolder.get(f.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })),
    allCount,
    deletedCount,
  };
}

/** Trimmed, 1–60 chars, not the name of another of the owner's folders (ignoring case). */
async function folderName(db: ScopedDb, userId: string, raw: string, exceptId?: string): Promise<string> {
  const name = raw.trim();
  if (!name) throw new NoteError("VALIDATION", "Folder name is required");
  if (name.length > FOLDER_NAME_MAX) throw new NoteError("VALIDATION", `Folder name must be at most ${FOLDER_NAME_MAX} characters`);
  const clash = await db.noteFolder.findFirst({
    where: { userId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new NoteError("VALIDATION", "You already have a folder with that name");
  return name;
}

export async function createFolderWith(db: ScopedDb, userId: string, name: string): Promise<{ id: string }> {
  return db.noteFolder.create({ data: { userId, name: await folderName(db, userId, name) }, select: { id: true } });
}

export async function renameFolderWith(db: ScopedDb, userId: string, id: string, name: string): Promise<void> {
  await assertOwnFolder(db, userId, id);
  await db.noteFolder.update({ where: { id }, data: { name: await folderName(db, userId, name, id) } });
}

/** Deletes the folder; its live notes go to Recently Deleted (remembering the folder, which no longer exists). */
export async function deleteFolderWith(db: ScopedDb, userId: string, id: string): Promise<{ deletedNotes: number }> {
  await assertOwnFolder(db, userId, id);
  const [moved] = await db.$transaction([
    db.note.updateMany({
      where: { userId, folderId: id, deletedAt: null },
      data: { deletedAt: new Date(), deletedFromFolderId: id, folderId: null, pinned: false },
    }),
    db.noteFolder.delete({ where: { id } }),
  ]);
  return { deletedNotes: moved.count };
}
