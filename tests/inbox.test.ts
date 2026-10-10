import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { countNotificationsWith, listNotificationsWith, markAllReadWith, markReadWith, unreadCountWith } from "@/lib/inbox";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("inbox", () => {
  let db: TestDb;
  let a: string, b: string, reqId: string;

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    a = (await p.user.create({ data: { email: "a@clogent.co.id", name: "A", fullName: "A", appRole: "REQUESTER", jobRole: "OTHER" } })).id;
    b = (await p.user.create({ data: { email: "b@clogent.co.id", name: "B", fullName: "B", appRole: "REQUESTER", jobRole: "OTHER" } })).id;
    const brand = await p.brand.create({ data: { name: "B" } });
    const div = await p.division.create({ data: { name: "D" } });
    const type = await p.requestType.create({ data: { name: "T" } });
    reqId = (await p.request.create({ data: { title: "x", brandId: brand.id, divisionId: div.id, typeId: type.id, requesterId: a } })).id;
  });
  afterAll(async () => { await db?.stop(); });
  beforeEach(async () => {
    await db.prisma.notification.deleteMany();
    const t0 = Date.UTC(2026, 9, 1);
    for (let i = 0; i < 25; i++)
      await db.prisma.notification.create({ data: { userId: a, requestId: reqId, type: "COMMENT", message: `m${i}`, createdAt: new Date(t0 + i * 60_000) } });
    await db.prisma.notification.create({ data: { userId: b, requestId: reqId, type: "COMMENT", message: "for b" } });
  });

  it("lists the newest 20 of my own, then the rest with an offset", async () => {
    const first = await listNotificationsWith(db.prisma, a);
    expect(first).toHaveLength(20);
    expect(first[0].message).toBe("m24");
    expect(first[19].message).toBe("m5");
    const rest = await listNotificationsWith(db.prisma, a, { offset: 20 });
    expect(rest.map((n) => n.message)).toEqual(["m4", "m3", "m2", "m1", "m0"]);
    expect([...first, ...rest].some((n) => n.message === "for b")).toBe(false);
    expect(Object.keys(first[0]).sort()).toEqual(["createdAt", "id", "message", "readAt", "requestId", "type"]);
  });

  it("counts total and unread", async () => {
    expect(await countNotificationsWith(db.prisma, a)).toBe(25);
    expect(await unreadCountWith(db.prisma, a)).toBe(25);
  });

  it("marks one read and keeps the first readAt on a repeat", async () => {
    const [n] = await listNotificationsWith(db.prisma, a, { limit: 1 });
    const t1 = new Date(Date.UTC(2026, 9, 2));
    await markReadWith(db.prisma, a, n.id, t1);
    await markReadWith(db.prisma, a, n.id, new Date(Date.UTC(2026, 9, 3)));
    expect(await unreadCountWith(db.prisma, a)).toBe(24);
    expect((await db.prisma.notification.findUnique({ where: { id: n.id } }))!.readAt).toEqual(t1);
  });

  it("cannot mark another person's notification", async () => {
    const theirs = await db.prisma.notification.findFirstOrThrow({ where: { userId: b } });
    await expect(markReadWith(db.prisma, a, theirs.id)).resolves.toBeUndefined();
    expect(await unreadCountWith(db.prisma, b)).toBe(1);
  });

  it("marks all of mine read and leaves others alone", async () => {
    await markAllReadWith(db.prisma, a);
    expect(await unreadCountWith(db.prisma, a)).toBe(0);
    expect(await unreadCountWith(db.prisma, b)).toBe(1);
  });
});
