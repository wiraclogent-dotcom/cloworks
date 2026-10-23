import { describe, it, expect, vi } from "vitest";

// A signed-in user whose database must never be reached: input checks run first.
vi.mock("@/lib/session", () => ({
  requireUser: async () => ({ id: "u1", name: "U", appRole: "REQUESTER", jobRole: "OTHER", workspaceId: "w", mustChangePassword: false }),
  dbFor: () => new Proxy({}, { get: () => { throw new Error("database reached"); } }),
}));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import {
  createFolder, createNote, deleteFolder, deleteNote, deleteNoteNow, moveNote, renameFolder, restoreNote, saveNote, setNotePinned,
} from "@/app/(app)/notes/actions";

const bad = <T,>(v: unknown) => v as T;

describe("notes actions check their input before the database", () => {
  it("refuses non-string ids and names, non-boolean pins and non-null folder ids", async () => {
    for (const r of [
      await createNote(bad({ not: "" })), await saveNote(bad({ not: "" }), {}), await setNotePinned(bad(1), true),
      await setNotePinned("n", bad("yes")), await moveNote("n", bad({ in: [] })), await deleteNote(bad(null)),
      await restoreNote(bad([])), await deleteNoteNow(bad({})), await createFolder(bad(5)), await renameFolder("f", bad(null)),
      await deleteFolder(bad(undefined)),
    ]) expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});
