import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("notes schema", () => {
  let db: TestDb;
  let userId: string;
  beforeAll(async () => {
    db = await createTestDb();
    userId = (await db.prisma.user.create({ data: { email: "n@clogent.co.id", name: "N", fullName: "N" } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  it("stamps the scoped workspace on folders and notes", async () => {
    const f = await db.prisma.noteFolder.create({ data: { userId, name: "Meeting" } });
    const n = await db.prisma.note.create({ data: { userId, folderId: f.id, body: { type: "doc", content: [] } } });
    expect([f.workspaceId, n.workspaceId]).toEqual([db.workspaceId, db.workspaceId]);
    expect([n.title, n.text, n.pinned, n.deletedAt]).toEqual(["", "", false, null]);
  });

  it("deleting a folder leaves its notes without a folder", async () => {
    const f = await db.prisma.noteFolder.create({ data: { userId, name: "Tmp" } });
    const n = await db.prisma.note.create({ data: { userId, folderId: f.id, body: {} } });
    await db.prisma.noteFolder.delete({ where: { id: f.id } });
    expect((await db.prisma.note.findUniqueOrThrow({ where: { id: n.id } })).folderId).toBeNull();
  });
});
