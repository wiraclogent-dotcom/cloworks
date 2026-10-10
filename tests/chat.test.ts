import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isParticipantWith, markChatReadWith, chatUnreadCountWith, participantWhere, listChatsWith, listMessagesWith } from "@/lib/chat";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("request chat", () => {
  let db: TestDb;
  let R: string, D: string, C: string, M: string, X: string, reqId: string;
  let times: Date[];
  let brandId: string, divId: string, typeId: string;

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const mk = async (k: string) =>
      (await p.user.create({ data: { email: `${k}@clogent.co.id`, name: k, fullName: k, appRole: "REQUESTER", jobRole: "OTHER" } })).id;
    [R, D, C, M, X] = [await mk("r"), await mk("d"), await mk("c"), await mk("m"), await mk("x")];
    const brand = await p.brand.create({ data: { name: "B" } });
    const div = await p.division.create({ data: { name: "D" } });
    const type = await p.requestType.create({ data: { name: "T" } });
    [brandId, divId, typeId] = [brand.id, div.id, type.id];
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

  describe("chat list and messages", () => {
    const mkUser = async (k: string) =>
      (await db.prisma.user.create({ data: { email: `${k}-${Math.random().toString(36).slice(2)}@clogent.co.id`, name: k, fullName: k, appRole: "REQUESTER", jobRole: "OTHER" } })).id;
    const mkReq = async (requesterId: string, title = "t") =>
      (await db.prisma.request.create({ data: { title, brandId, divisionId: divId, typeId, requesterId } })).id;
    const say = (requestId: string, authorId: string, body: string, createdAt: Date) =>
      db.prisma.comment.create({ data: { requestId, authorId, body, createdAt } });
    const day = (d: number) => new Date(Date.UTC(2026, 8, d));

    it("lists chats newest-activity first, skipping empty ones, with paging", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q, "A"), B = await mkReq(Q, "B"), E = await mkReq(Q, "E");
      await say(A, C, "a-old", day(1));
      await say(A, C, "a-last", day(5));
      await say(B, C, "b-last", day(9));
      const list = await listChatsWith(db.prisma, Q);
      expect(list.map((c) => c.requestId)).toEqual([B, A]);
      expect(list.map((c) => c.requestId)).not.toContain(E);
      expect(list[1].lastMessage.body).toBe("a-last");
      expect(list[1].title).toBe("A");
      expect(await listChatsWith(db.prisma, X)).toEqual([]);
      const page = await listChatsWith(db.prisma, Q, { limit: 1, offset: 1 });
      expect(page.map((c) => c.requestId)).toEqual([A]);
    });

    it("truncates the preview to 120 chars and names the author", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q);
      await say(A, C, "z".repeat(300), day(2));
      const [chat] = await listChatsWith(db.prisma, Q);
      expect(chat.lastMessage.body.length).toBe(120);
      expect(chat.lastMessage.authorName).toBe("c");
      expect(chat.lastMessage.authorId).toBe(C);
    });

    it("per-chat unread sums to chatUnreadCountWith", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q), B = await mkReq(Q);
      await say(A, C, "1", day(1)); await say(A, C, "2", day(2)); await say(A, Q, "mine", day(3));
      await say(B, C, "3", day(4)); await say(B, C, "4", day(5));
      await markChatReadWith(db.prisma, Q, B, day(4));
      const list = await listChatsWith(db.prisma, Q);
      const byId = Object.fromEntries(list.map((c) => [c.requestId, c.unread]));
      expect(byId[A]).toBe(2);
      expect(byId[B]).toBe(1);
      expect(list.reduce((n, c) => n + c.unread, 0)).toBe(await chatUnreadCountWith(db.prisma, { id: Q, workspaceId: db.workspaceId }));
    });

    it("pages messages: newest 30 ascending, then the older rest", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q);
      for (let i = 0; i < 35; i++) await say(A, C, `m${i}`, new Date(Date.UTC(2026, 8, 1, 0, i)));
      const r = await listMessagesWith(db.prisma, Q, A);
      if (!r.ok) throw new Error("expected ok");
      expect(r.messages).toHaveLength(30);
      expect(r.messages[0].body).toBe("m5");
      expect(r.messages[29].body).toBe("m34");
      expect(r.hasOlder).toBe(true);
      expect(r.messages[0].author).toEqual({ id: C, name: "c" });
      const older = await listMessagesWith(db.prisma, Q, A, { before: r.messages[0].createdAt });
      if (!older.ok) throw new Error("expected ok");
      expect(older.messages.map((m) => m.body)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
      expect(older.hasOlder).toBe(false);
    });

    it("after returns only newer messages ascending; equal timestamps come back in id order", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q);
      for (let i = 0; i < 3; i++) await say(A, C, `m${i}`, day(i + 1));
      const r = await listMessagesWith(db.prisma, Q, A, { after: day(1) });
      if (!r.ok) throw new Error("expected ok");
      expect(r.messages.map((m) => m.body)).toEqual(["m1", "m2"]);
      expect(r.hasOlder).toBe(false);

      const B = await mkReq(Q);
      const t = day(7);
      await say(B, C, "p", t); await say(B, C, "q", t);
      const same = await listMessagesWith(db.prisma, Q, B);
      if (!same.ok) throw new Error("expected ok");
      expect(same.messages).toHaveLength(2);
      const ids = same.messages.map((m) => m.id);
      expect(ids).toEqual([...ids].sort());
    });

    it("rejects non-participants and unknown requests", async () => {
      expect(await listMessagesWith(db.prisma, X, reqId)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await listMessagesWith(db.prisma, R, "nope")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });
  });
});
