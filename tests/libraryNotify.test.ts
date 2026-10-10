import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { notifyLibraryWith, LIBRARY_NOTIFICATION } from "@/lib/libraryNotify";
import { notificationHref } from "@/lib/notificationLinks";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("notifyLibraryWith", () => {
  let db: TestDb;
  let lead: string, alice: string, bob: string, gone: string;

  beforeAll(async () => {
    db = await createTestDb();
    const mk = (name: string, active = true) =>
      db.prisma.user.create({ data: { email: `${name}@clogent.co.id`, name, fullName: name, appRole: "REQUESTER", active } }).then((u) => u.id);
    [lead, alice, bob, gone] = await Promise.all([mk("Lead"), mk("Alice"), mk("Bob"), mk("Gone", false)]);
    const ws = await db.raw.workspace.create({ data: { name: "Other", slug: "other-notify" } });
    await db.raw.user.create({ data: { name: "Outsider", fullName: "Outsider", appRole: "REQUESTER", workspaceId: ws.id } });
  });
  afterAll(async () => { await db?.stop(); });

  it("tells every active member of the workspace except the actor, in-app only, linking to the Library", async () => {
    await notifyLibraryWith(db.prisma, lead, "added", "Box Laundry Pods");
    const rows = await db.raw.notification.findMany({ where: { type: LIBRARY_NOTIFICATION }, orderBy: { userId: "asc" } });
    expect(rows.map((r) => r.userId).sort()).toEqual([alice, bob].sort());
    expect(rows.every((r) => r.requestId === null && r.emailedAt === null)).toBe(true);
    expect(rows[0].message).toBe("Lead added “Box Laundry Pods” to the Library");
    expect(rows.some((r) => r.userId === gone || r.userId === lead)).toBe(false);
    expect(notificationHref(rows[0])).toBe("/library");
  });

  it("says updated for edits and cleans the title", async () => {
    await notifyLibraryWith(db.prisma, lead, "updated", "Brand\nAsset   Clogent");
    const r = await db.prisma.notification.findFirstOrThrow({ where: { type: LIBRARY_NOTIFICATION, userId: alice }, orderBy: { createdAt: "desc" } });
    expect(r.message).toBe("Lead updated “Brand Asset Clogent” in the Library");
  });

  it("request notifications still link to their request; others to nothing", () => {
    expect(notificationHref({ type: "COMMENT", requestId: "r1" })).toBe("/requests/r1");
    expect(notificationHref({ type: "COMMENT", requestId: null })).toBeNull();
  });
});
