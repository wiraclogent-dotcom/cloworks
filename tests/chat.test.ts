import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AFTER_OVERLAP_MS, isParticipantWith, markChatReadWith, chatUnreadCountWith, latestUnreadChatWith, participantWhere, listChatsWith, listMessagesWith } from "@/lib/chat";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("request chat", () => {
  let db: TestDb;
  let R: string, D: string, C: string, M: string, X: string, reqId: string;
  let times: Date[];
  let brandId: string, divId: string, typeId: string;

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    // These fixtures predate "start fresh": put chat launch before every fixture comment so "no row" means unread.
    await db.raw.workspace.update({ where: { id: db.workspaceId }, data: { chatSince: new Date(0) } });
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
      const list = await listChatsWith(db.prisma, { id: Q, workspaceId: db.workspaceId });
      expect(list.map((c) => c.requestId)).toEqual([B, A]);
      expect(list.map((c) => c.requestId)).not.toContain(E);
      expect(list[1].lastMessage.body).toBe("a-last");
      expect(list[1].title).toBe("A");
      expect(await listChatsWith(db.prisma, { id: X, workspaceId: db.workspaceId })).toEqual([]);
      const page = await listChatsWith(db.prisma, { id: Q, workspaceId: db.workspaceId }, { limit: 1, offset: 1 });
      expect(page.map((c) => c.requestId)).toEqual([A]);
    });

    it("truncates the preview to 120 chars and names the author", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q);
      await say(A, C, "z".repeat(300), day(2));
      const [chat] = await listChatsWith(db.prisma, { id: Q, workspaceId: db.workspaceId });
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
      const list = await listChatsWith(db.prisma, { id: Q, workspaceId: db.workspaceId });
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
      const older = await listMessagesWith(db.prisma, Q, A, { before: { at: r.messages[0].createdAt, id: r.messages[0].id } });
      if (!older.ok) throw new Error("expected ok");
      expect(older.messages.map((m) => m.body)).toEqual(["m0", "m1", "m2", "m3", "m4"]);
      expect(older.hasOlder).toBe(false);
    });

    it("after returns newer messages ascending; equal timestamps come back in id order", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q);
      for (let i = 0; i < 3; i++) await say(A, C, `m${i}`, day(i + 1));
      const first = await listMessagesWith(db.prisma, Q, A);
      if (!first.ok) throw new Error("expected ok");
      const r = await listMessagesWith(db.prisma, Q, A, { after: { at: first.messages[0].createdAt, id: first.messages[0].id } });
      if (!r.ok) throw new Error("expected ok");
      // The cursor row is inside the overlap window and may come back too (the client de-dups by id).
      expect(r.messages.map((m) => m.body).filter((b) => b !== "m0")).toEqual(["m1", "m2"]);
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

    it("orders tied timestamps by id regardless of insertion order", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q);
      const t = day(8);
      await db.prisma.comment.create({ data: { id: "t-b", requestId: A, authorId: C, body: "b", createdAt: t } });
      await db.prisma.comment.create({ data: { id: "t-a", requestId: A, authorId: C, body: "a", createdAt: t } });
      const r = await listMessagesWith(db.prisma, Q, A);
      if (!r.ok) throw new Error("expected ok");
      expect(r.messages.map((m) => m.id)).toEqual(["t-a", "t-b"]);
    });

    it("before cursor keeps ties across a page boundary", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q);
      const tie = day(9);
      const ids: string[] = [];
      await db.prisma.comment.create({ data: { id: "bd-a", requestId: A, authorId: C, body: "x", createdAt: tie } });
      await db.prisma.comment.create({ data: { id: "bd-b", requestId: A, authorId: C, body: "y", createdAt: tie } });
      ids.push("bd-a", "bd-b");
      for (let i = 0; i < 29; i++) {
        const c = await say(A, C, `n${i}`, new Date(Date.UTC(2026, 8, 10, 0, i)));
        ids.push(c.id);
      }
      const p1 = await listMessagesWith(db.prisma, Q, A);
      if (!p1.ok) throw new Error("expected ok");
      expect(p1.messages).toHaveLength(30);
      expect(p1.messages[0].id).toBe("bd-b");
      expect(p1.hasOlder).toBe(true);
      const p2 = await listMessagesWith(db.prisma, Q, A, { before: { at: p1.messages[0].createdAt, id: p1.messages[0].id } });
      if (!p2.ok) throw new Error("expected ok");
      expect(p2.messages.map((m) => m.id)).toEqual(["bd-a"]);
      expect([...p2.messages, ...p1.messages].map((m) => m.id).sort()).toEqual([...ids].sort());
    });

    it("after cursor returns tied rows with a higher id", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q);
      const t = day(11);
      await db.prisma.comment.create({ data: { id: "af-a", requestId: A, authorId: C, body: "a", createdAt: t } });
      await db.prisma.comment.create({ data: { id: "af-b", requestId: A, authorId: C, body: "b", createdAt: t } });
      const r = await listMessagesWith(db.prisma, Q, A, { after: { at: t, id: "af-a" } });
      if (!r.ok) throw new Error("expected ok");
      expect(r.messages.map((m) => m.id)).toContain("af-b");
    });

    it("after cursor picks up a comment that committed late with an earlier timestamp", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q);
      const t = day(12);
      await db.prisma.comment.create({ data: { id: "late-cur", requestId: A, authorId: C, body: "seen", createdAt: t } });
      // Committed after the client polled up to `late-cur`, but stamped 10 s earlier.
      await db.prisma.comment.create({ data: { id: "late-z", requestId: A, authorId: C, body: "late", createdAt: new Date(t.getTime() - 10_000) } });
      const old = await db.prisma.comment.create({ data: { requestId: A, authorId: C, body: "old", createdAt: new Date(t.getTime() - AFTER_OVERLAP_MS - 1) } });
      const r = await listMessagesWith(db.prisma, Q, A, { after: { at: t, id: "late-cur" } });
      if (!r.ok) throw new Error("expected ok");
      const ids = r.messages.map((m) => m.id);
      expect(ids).toContain("late-z");
      expect(ids).not.toContain(old.id);
      expect(r.messages.map((m) => m.createdAt.getTime())).toEqual([...r.messages.map((m) => m.createdAt.getTime())].sort((a, b) => a - b));
    });

    it("latestUnreadChatWith returns the request of the newest unread message from others", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q, "Alpha"), B = await mkReq(Q, "Beta");
      await say(A, C, "a1", day(1));
      await say(B, C, "b1", day(2));
      await say(A, C, "a2", day(3));
      await say(B, Q, "mine, newest", day(4));
      const me = { id: Q, workspaceId: db.workspaceId };
      expect(await latestUnreadChatWith(db.prisma, me)).toEqual({ requestId: A, title: "Alpha" });
      await markChatReadWith(db.prisma, Q, A, day(3));
      expect(await latestUnreadChatWith(db.prisma, me)).toEqual({ requestId: B, title: "Beta" });
      await markChatReadWith(db.prisma, Q, B, day(4));
      expect(await latestUnreadChatWith(db.prisma, me)).toBeNull();
    });

    it("latestUnreadChatWith ignores own messages and non-participants", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q, "Own");
      await say(A, Q, "only mine", day(5));
      expect(await latestUnreadChatWith(db.prisma, { id: Q, workspaceId: db.workspaceId })).toBeNull();
      const Y = await mkUser("y");
      await say(A, C, "from c", day(6));
      expect(await latestUnreadChatWith(db.prisma, { id: Y, workspaceId: db.workspaceId })).toBeNull();
    });

    it("latestUnreadChatWith ignores other workspaces", async () => {
      const Q = await mkUser("q");
      const A = await mkReq(Q, "Home");
      await say(A, C, "home", day(1));
      const raw = db.raw;
      const ws = await raw.workspace.create({ data: { name: "Other2", slug: "other-chat-latest" } });
      const w = { workspaceId: ws.id };
      const u = await raw.user.create({ data: { ...w, email: "o2@example.com", name: "O2", fullName: "O2" } });
      const brand = await raw.brand.create({ data: { ...w, name: "B" } });
      const div = await raw.division.create({ data: { ...w, name: "D" } });
      const type = await raw.requestType.create({ data: { ...w, name: "T" } });
      const r2 = await raw.request.create({ data: { ...w, title: "Away", brandId: brand.id, divisionId: div.id, typeId: type.id, requesterId: Q } });
      await raw.comment.create({ data: { ...w, requestId: r2.id, authorId: u.id, body: "other", createdAt: day(20) } });
      expect(await latestUnreadChatWith(db.prisma, { id: Q, workspaceId: db.workspaceId })).toEqual({ requestId: A, title: "Home" });
    });

    it("start fresh: without a ChatRead row, comments before chatSince count as read and later ones do not", async () => {
      const Q = await mkUser("q");
      const me = { id: Q, workspaceId: db.workspaceId };
      const launch = new Date(Date.UTC(2026, 10, 2));
      await db.raw.workspace.update({ where: { id: db.workspaceId }, data: { chatSince: launch } });
      try {
        const A = await mkReq(Q, "Before"), B = await mkReq(Q, "After");
        await say(A, C, "pre-launch", new Date(Date.UTC(2026, 10, 1)));
        expect(await chatUnreadCountWith(db.prisma, me)).toBe(0);
        expect(await latestUnreadChatWith(db.prisma, me)).toBeNull();
        expect((await listChatsWith(db.prisma, me)).map((c) => [c.requestId, c.unread])).toEqual([[A, 0]]);

        await say(B, C, "post-launch", new Date(Date.UTC(2026, 10, 3)));
        expect(await chatUnreadCountWith(db.prisma, me)).toBe(1);
        expect(await latestUnreadChatWith(db.prisma, me)).toEqual({ requestId: B, title: "After" });
        expect((await listChatsWith(db.prisma, me)).map((c) => [c.requestId, c.unread])).toEqual([[B, 1], [A, 0]]);
      } finally {
        await db.raw.workspace.update({ where: { id: db.workspaceId }, data: { chatSince: new Date(0) } });
      }
    });

    it("rejects non-participants and unknown requests", async () => {
      expect(await listMessagesWith(db.prisma, X, reqId)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await listMessagesWith(db.prisma, R, "nope")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });
  });
});
