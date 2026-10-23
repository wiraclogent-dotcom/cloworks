import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { NoteError } from "@/lib/notes/errors";
import { EMPTY_NOTE_DOC } from "@/lib/notes/doc";
import {
  createFolderWith, createNoteWith, deleteFolderWith, deleteNoteNowWith, deleteNoteWith, emptyDeletedWith, getNote,
  listFolders, listNotes, moveNoteWith, purgeExpiredNotes, renameFolderWith, restoreNoteWith, saveNoteWith, setPinnedWith,
} from "@/lib/notes/notes";

const body = (...lines: string[]) => ({
  type: "doc",
  content: lines.map((t) => (t ? { type: "paragraph", content: [{ type: "text", text: t }] } : { type: "paragraph" })),
});
const code = (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof NoteError ? e.code : `other:${e}`));
const DAY = 24 * 60 * 60 * 1000;

describe("note cores", () => {
  let db: TestDb;
  let n = 0;
  const freshUser = async () =>
    (await db.prisma.user.create({ data: { email: `u${++n}@clogent.co.id`, name: `U${n}`, fullName: `U${n}` } })).id;
  const folder = (userId: string, name: string) => db.prisma.noteFolder.create({ data: { userId, name } });
  const note = async (userId: string, lines: string[], folderId: string | null = null) => {
    const { id } = await createNoteWith(db.prisma, userId, folderId);
    await saveNoteWith(db.prisma, userId, id, body(...lines));
    return id;
  };
  const ids = async (userId: string, view: string, q?: string) => (await listNotes(db.prisma, userId, { view, q })).map((r) => r.id);

  beforeAll(async () => { db = await createTestDb(); });
  afterAll(async () => { await db?.stop(); });

  it("only the owner can read or change a note", async () => {
    const me = await freshUser(), other = await freshUser();
    const id = await note(me, ["Rahasia"]);
    expect(await getNote(db.prisma, other, id)).toBeNull();
    for (const call of [
      () => saveNoteWith(db.prisma, other, id, EMPTY_NOTE_DOC), () => setPinnedWith(db.prisma, other, id, true),
      () => moveNoteWith(db.prisma, other, id, null), () => deleteNoteWith(db.prisma, other, id),
      () => restoreNoteWith(db.prisma, other, id), () => deleteNoteNowWith(db.prisma, other, id),
    ]) expect(await code(call())).toBe("NOT_FOUND");
    expect(await ids(other, "all")).not.toContain(id);
    const kept = await getNote(db.prisma, me, id);
    expect([kept?.title, kept?.pinned, kept?.deletedAt]).toEqual(["Rahasia", false, null]);
  });

  it("a note can't be created in or moved to someone else's folder", async () => {
    const me = await freshUser(), other = await freshUser();
    const theirs = await folder(other, "Theirs");
    expect(await code(createNoteWith(db.prisma, me, theirs.id))).toBe("NOT_FOUND");
    const id = await note(me, ["x"]);
    expect(await code(moveNoteWith(db.prisma, me, id, theirs.id))).toBe("NOT_FOUND");
  });

  it("save derives title, text and preview", async () => {
    const me = await freshUser();
    const { id } = await createNoteWith(db.prisma, me, null);
    const r = await saveNoteWith(db.prisma, me, id, body("", "Rapat", "Agenda KPI"));
    expect([r.title, r.preview]).toEqual(["Rapat", "Agenda KPI"]);
    const [row] = await listNotes(db.prisma, me, { view: "all" });
    expect([row.title, row.preview]).toEqual(["Rapat", "Agenda KPI"]);
    expect((await db.prisma.note.findUniqueOrThrow({ where: { id } })).text).toBe("\nRapat\nAgenda KPI");
  });

  it("refuses an invalid body", async () => {
    const me = await freshUser();
    const id = await note(me, ["x"]);
    expect(await code(saveNoteWith(db.prisma, me, id, { type: "doc", content: [{ type: "image" }] }))).toBe("INVALID");
  });

  it("lists pinned first, then most recently edited", async () => {
    const me = await freshUser();
    const a = await note(me, ["a"]), b = await note(me, ["b"]), c = await note(me, ["c"]);
    await db.prisma.note.update({ where: { id: c }, data: { updatedAt: new Date(Date.now() - 3 * DAY) } });
    await db.prisma.note.update({ where: { id: a }, data: { updatedAt: new Date(Date.now() - 2 * DAY) } });
    await db.prisma.note.update({ where: { id: b }, data: { updatedAt: new Date(Date.now() - DAY) } });
    await setPinnedWith(db.prisma, me, c, true);
    await db.prisma.note.update({ where: { id: c }, data: { updatedAt: new Date(Date.now() - 3 * DAY) } });
    expect(await ids(me, "all")).toEqual([c, b, a]);
  });

  it("searches title and text, case-insensitive, within the view", async () => {
    const me = await freshUser();
    const f = await folder(me, "Meeting");
    const inFolder = await note(me, ["Rapat", "Agenda KPI"], f.id);
    const loose = await note(me, ["kpi bulanan"]);
    await note(me, ["Belanja"]);
    expect((await ids(me, "all", "kpi")).sort()).toEqual([inFolder, loose].sort());
    expect(await ids(me, f.id, "KPI")).toEqual([inFolder]);
    expect(await ids(me, "all", "   ")).toHaveLength(3);
  });

  it("matches % and _ literally", async () => {
    const me = await freshUser();
    const pct = await note(me, ["Diskon 50%"]);
    await note(me, ["Diskon 500"]);
    await note(me, ["ab"]);
    expect(await ids(me, "all", "50%")).toEqual([pct]);
    expect(await ids(me, "all", "_")).toEqual([]);
  });

  it("a folder view only shows that folder of the owner", async () => {
    const me = await freshUser(), other = await freshUser();
    const theirs = await folder(other, "Theirs");
    await note(other, ["theirs"], theirs.id);
    expect(await ids(me, theirs.id)).toEqual([]);
  });

  it("deleted notes leave the live views and appear in Recently Deleted, unpinned", async () => {
    const me = await freshUser();
    const f = await folder(me, "Meeting");
    const id = await note(me, ["Bye"], f.id);
    await setPinnedWith(db.prisma, me, id, true);
    expect(await deleteNoteWith(db.prisma, me, id)).toEqual({ purged: false });
    expect(await ids(me, "all")).toEqual([]);
    expect(await ids(me, f.id)).toEqual([]);
    expect(await ids(me, "deleted")).toEqual([id]);
    const row = await db.prisma.note.findUniqueOrThrow({ where: { id } });
    expect([row.pinned, row.folderId, row.deletedFromFolderId, row.deletedAt !== null]).toEqual([false, null, f.id, true]);
  });

  it("restore returns a note to its folder, or to no folder when the folder is gone", async () => {
    const me = await freshUser();
    const f = await folder(me, "F"), g = await folder(me, "G");
    const inF = await note(me, ["f"], f.id), inG = await note(me, ["g"], g.id);
    await deleteNoteWith(db.prisma, me, inF);
    expect(await restoreNoteWith(db.prisma, me, inF)).toEqual({ folderId: f.id });
    expect((await getNote(db.prisma, me, inF))?.folderId).toBe(f.id);
    await deleteNoteWith(db.prisma, me, inG);
    await db.prisma.noteFolder.delete({ where: { id: g.id } });
    expect(await restoreNoteWith(db.prisma, me, inG)).toEqual({ folderId: null });
    expect(await ids(me, "all")).toContain(inG);
  });

  it("an empty note is deleted for good", async () => {
    const me = await freshUser();
    const { id } = await createNoteWith(db.prisma, me, null);
    expect(await deleteNoteWith(db.prisma, me, id)).toEqual({ purged: true });
    expect(await getNote(db.prisma, me, id)).toBeNull();
    const blank = await note(me, ["   "]);
    expect(await deleteNoteWith(db.prisma, me, blank)).toEqual({ purged: true });
  });

  it("refuses to save or pin a deleted note", async () => {
    const me = await freshUser();
    const id = await note(me, ["x"]);
    await deleteNoteWith(db.prisma, me, id);
    expect(await code(saveNoteWith(db.prisma, me, id, body("y")))).toBe("DELETED");
    expect(await code(setPinnedWith(db.prisma, me, id, true))).toBe("DELETED");
  });

  it("Delete now and Empty remove only the owner's deleted notes", async () => {
    const me = await freshUser(), other = await freshUser();
    const live = await note(me, ["live"]);
    expect(await code(deleteNoteNowWith(db.prisma, me, live))).toBe("VALIDATION");
    const gone = await note(me, ["gone"]), alsoGone = await note(me, ["also"]);
    const theirs = await note(other, ["theirs"]);
    for (const [u, id] of [[me, gone], [me, alsoGone], [other, theirs]] as const) await deleteNoteWith(db.prisma, u, id);
    await deleteNoteNowWith(db.prisma, me, gone);
    expect(await getNote(db.prisma, me, gone)).toBeNull();
    expect(await emptyDeletedWith(db.prisma, me)).toBe(1);
    expect(await ids(me, "deleted")).toEqual([]);
    expect(await ids(me, "all")).toEqual([live]);
    expect(await ids(other, "deleted")).toEqual([theirs]);
  });

  it("purge removes only the owner's notes deleted more than 30 days ago", async () => {
    const me = await freshUser(), other = await freshUser();
    const now = new Date();
    const old = await note(me, ["old"]), recent = await note(me, ["recent"]), theirs = await note(other, ["theirs"]);
    for (const [id, ago] of [[old, 31], [recent, 29], [theirs, 31]] as const)
      await db.prisma.note.update({ where: { id }, data: { deletedAt: new Date(now.getTime() - ago * DAY) } });
    expect(await purgeExpiredNotes(db.prisma, me, now)).toBe(1);
    expect(await ids(me, "deleted")).toEqual([recent]);
    expect(await ids(other, "deleted")).toEqual([theirs]);
  });

  describe("folders", () => {
    it("counts live notes per folder and in All Notes / Recently Deleted, folders A–Z", async () => {
      const me = await freshUser();
      const { id: meeting } = await createFolderWith(db.prisma, me, "meeting");
      const { id: draft } = await createFolderWith(db.prisma, me, "Draft");
      await note(me, ["a"], meeting);
      await note(me, ["b"], meeting);
      await note(me, ["loose"]);
      await deleteNoteWith(db.prisma, me, await note(me, ["gone"], meeting));
      expect(await listFolders(db.prisma, me)).toEqual({
        folders: [{ id: draft, name: "Draft", count: 0 }, { id: meeting, name: "meeting", count: 2 }],
        allCount: 3,
        deletedCount: 1,
      });
    });

    it("names: trimmed, required, at most 60, unique per person ignoring case", async () => {
      const me = await freshUser(), other = await freshUser();
      expect(await code(createFolderWith(db.prisma, me, "  "))).toBe("VALIDATION");
      expect(await code(createFolderWith(db.prisma, me, "x".repeat(61)))).toBe("VALIDATION");
      const { id } = await createFolderWith(db.prisma, me, " Ide konten ");
      expect((await listFolders(db.prisma, me)).folders.map((f) => f.name)).toEqual(["Ide konten"]);
      expect(await code(createFolderWith(db.prisma, me, "IDE KONTEN"))).toBe("VALIDATION");
      expect(await code(createFolderWith(db.prisma, other, "Ide konten"))).toBe("ok");
      const { id: second } = await createFolderWith(db.prisma, me, "Pribadi");
      expect(await code(renameFolderWith(db.prisma, me, second, "ide Konten"))).toBe("VALIDATION");
      expect(await code(renameFolderWith(db.prisma, me, id, "Ide Konten"))).toBe("ok");
      expect((await listFolders(db.prisma, me)).folders.map((f) => f.name)).toEqual(["Ide Konten", "Pribadi"]);
    });

    it("deleting a folder sends its live notes to Recently Deleted; restore brings them to All Notes", async () => {
      const me = await freshUser();
      const { id: f } = await createFolderWith(db.prisma, me, "Meeting");
      const a = await note(me, ["a"], f), b = await note(me, ["b"], f);
      expect(await deleteFolderWith(db.prisma, me, f)).toEqual({ deletedNotes: 2 });
      expect((await listFolders(db.prisma, me)).folders).toEqual([]);
      expect((await ids(me, "deleted")).sort()).toEqual([a, b].sort());
      expect(await restoreNoteWith(db.prisma, me, a)).toEqual({ folderId: null });
      expect(await ids(me, "all")).toEqual([a]);
    });

    it("another person's folder is not found", async () => {
      const me = await freshUser(), other = await freshUser();
      const { id: theirs } = await createFolderWith(db.prisma, other, "Theirs");
      expect(await code(renameFolderWith(db.prisma, me, theirs, "Mine"))).toBe("NOT_FOUND");
      expect(await code(deleteFolderWith(db.prisma, me, theirs))).toBe("NOT_FOUND");
      expect((await listFolders(db.prisma, other)).folders.map((f) => f.name)).toEqual(["Theirs"]);
    });
  });
});
