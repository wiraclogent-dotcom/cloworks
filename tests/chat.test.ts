import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isParticipantWith, markChatReadWith, chatUnreadCountWith, participantWhere } from "@/lib/chat";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("request chat", () => {
  let db: TestDb;
  let R: string, D: string, C: string, M: string, X: string, reqId: string;
  let times: Date[];

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const mk = async (k: string) =>
      (await p.user.create({ data: { email: `${k}@clogent.co.id`, name: k, fullName: k, appRole: "REQUESTER", jobRole: "OTHER" } })).id;
    [R, D, C, M, X] = [await mk("r"), await mk("d"), await mk("c"), await mk("m"), await mk("x")];
    const brand = await p.brand.create({ data: { name: "B" } });
    const div = await p.division.create({ data: { name: "D" } });
    const type = await p.requestType.create({ data: { name: "T" } });
    reqId = (await p.request.create({ data: { title: "x", brandId: brand.id, divisionId: div.id, typeId: type.id, requesterId: R, assigneeId: D } })).id;
    times = [1, 2, 3].map((i) => new Date(Date.UTC(2026, 9, i)));
    for (const [i, at] of times.entries())
      await p.comment.create({ data: { requestId: reqId, authorId: C, body: `c${i}`, mentions: i === 0 ? [M] : [], createdAt: at } });
  });
  afterAll(async () => { await db?.stop(); });

  it("participantWhere finds the request for R, D, C and M but not X", async () => {
    for (const u of [R, D, C, M]) expect(await db.prisma.request.count({ where: participantWhere(u) })).toBe(1);
    expect(await db.prisma.request.count({ where: participantWhere(X) })).toBe(0);
  });

  it("classifies participants", async () => {
    for (const u of [R, D, C, M]) expect(await isParticipantWith(db.prisma, u, reqId)).toBe("yes");
    expect(await isParticipantWith(db.prisma, X, reqId)).toBe("no");
    expect(await isParticipantWith(db.prisma, R, "nope")).toBe("missing");
  });

  it("counts unread from others, then only those after the read position", async () => {
    const me = (id: string) => ({ id, workspaceId: db.workspaceId });
    expect(await chatUnreadCountWith(db.prisma, me(R))).toBe(3);
    expect(await chatUnreadCountWith(db.prisma, me(C))).toBe(0);
    expect(await chatUnreadCountWith(db.prisma, me(X))).toBe(0);
    await markChatReadWith(db.prisma, R, reqId, times[1]);
    expect(await chatUnreadCountWith(db.prisma, me(R))).toBe(1);
  });

  it("never moves the read position back and keeps one row", async () => {
    await markChatReadWith(db.prisma, D, reqId, times[2]);
    await markChatReadWith(db.prisma, D, reqId, times[0]);
    const rows = await db.prisma.chatRead.findMany({ where: { userId: D, requestId: reqId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].lastReadAt).toEqual(times[2]);
  });

  it("creates no row for a non-participant", async () => {
    await markChatReadWith(db.prisma, X, reqId, times[2]);
    expect(await db.prisma.chatRead.count({ where: { userId: X } })).toBe(0);
  });

  it("ignores other workspaces", async () => {
    const raw = db.raw;
    const ws = await raw.workspace.create({ data: { name: "Other", slug: "other-chat" } });
    const w = { workspaceId: ws.id };
    const u = await raw.user.create({ data: { ...w, email: "o@example.com", name: "O", fullName: "O" } });
    const brand = await raw.brand.create({ data: { ...w, name: "B" } });
    const div = await raw.division.create({ data: { ...w, name: "D" } });
    const type = await raw.requestType.create({ data: { ...w, name: "T" } });
    const r2 = await raw.request.create({ data: { ...w, title: "o", brandId: brand.id, divisionId: div.id, typeId: type.id, requesterId: R } });
    await raw.comment.create({ data: { ...w, requestId: r2.id, authorId: u.id, body: "other" } });
    expect(await chatUnreadCountWith(db.prisma, { id: R, workspaceId: db.workspaceId })).toBe(1);
  });
});
