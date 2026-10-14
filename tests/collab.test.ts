import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { addCommentWith, setAssigneesWith, addAttachmentWith, removeAttachmentWith, splitMentions } from "@/lib/collab";
import type { NotifyInput } from "@/lib/notify";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("collaboration cores", () => {
  let db: TestDb;
  const ids: Record<string, string> = {};
  let reqId: string, cancelledId: string;
  const actor = (k: string, appRole: "REQUESTER" | "CREATIVE" | "LEAD" | "ADMIN") => ({ id: ids[k], appRole });

  beforeAll(async () => {
    db = await createTestDb();
    const p = db.prisma;
    const mk = async (k: string, name: string, appRole: "REQUESTER" | "CREATIVE" | "LEAD" | "ADMIN", extra: { aliases?: string[]; active?: boolean } = {}) => {
      // Creatives are designers (the creative team); the lead is not on the team.
      ids[k] = (await p.user.create({ data: { email: `${k}@clogent.co.id`, name, fullName: name, appRole, jobRole: appRole === "CREATIVE" ? "DESIGNER" : "OTHER", ...extra } })).id;
    };
    await mk("author", "Rina", "REQUESTER");
    await mk("other", "Oki", "REQUESTER");
    await mk("dimas", "Dimas Pandu", "CREATIVE", { aliases: ["dp"] });
    await mk("irsyad", "Irsyad", "CREATIVE", { aliases: ["Syad", "Irsyad Fulan"] });
    await mk("lead", "Lia", "LEAD");
    await mk("gone", "Gone", "CREATIVE", { active: false });
    await mk("amb1", "Sam", "CREATIVE", { aliases: ["shared"] });
    await mk("amb2", "Samuel", "CREATIVE", { aliases: ["shared"] });
    const brand = await p.brand.create({ data: { name: "B" } });
    const div = await p.division.create({ data: { name: "D" } });
    const type = await p.requestType.create({ data: { name: "T" } });
    const base = { title: "x", brandId: brand.id, divisionId: div.id, typeId: type.id, requesterId: ids.author };
    reqId = (await p.request.create({ data: base })).id;
    cancelledId = (await p.request.create({ data: { ...base, status: "CANCELLED" } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  const comment = (body: string, who = "author") => addCommentWith(db.prisma, actor(who, "REQUESTER"), reqId, body);

  describe("addCommentWith", () => {
    it("stores the trimmed body", async () => {
      const r = await comment("  hello  ");
      expect(r.ok).toBe(true);
      if (r.ok) expect((await db.prisma.comment.findUnique({ where: { id: r.commentId } }))?.body).toBe("hello");
    });
    it("rejects empty, whitespace and >5000", async () => {
      expect(await comment("")).toMatchObject({ ok: false, code: "INVALID" });
      expect(await comment("  \n ")).toMatchObject({ ok: false, code: "INVALID" });
      expect(await comment("a".repeat(5001))).toMatchObject({ ok: false, code: "INVALID" });
      expect((await comment("a".repeat(5000))).ok).toBe(true);
    });
    it("resolves short name, alias, case-insensitively, with punctuation", async () => {
      expect(await comment("hi @irsyad, look")).toMatchObject({ mentionedUserIds: [ids.irsyad] });
      expect(await comment("hi @SYAD.")).toMatchObject({ mentionedUserIds: [ids.irsyad] });
      expect(await comment("(@IRSYAD)")).toMatchObject({ mentionedUserIds: [ids.irsyad] });
    });
    it("matches a spaced name without the space, and single-token aliases only", async () => {
      expect(await comment("@DimasPandu please")).toMatchObject({ mentionedUserIds: [ids.dimas] });
      expect(await comment("@dp please")).toMatchObject({ mentionedUserIds: [ids.dimas] });
      expect(await comment("@IrsyadFulan")).toMatchObject({ mentionedUserIds: [] });
    });
    it("is whole-word: @Dim does not match Dimas; emails are not mentions", async () => {
      expect(await comment("@Dim")).toMatchObject({ mentionedUserIds: [] });
      expect(await comment("mail x@irsyad.com")).toMatchObject({ mentionedUserIds: [] });
    });
    it("ambiguous token mentions nobody and is not an error", async () => {
      expect(await comment("@shared")).toMatchObject({ ok: true, mentionedUserIds: [] });
    });
    it("never mentions inactive users, unknown tokens are text", async () => {
      expect(await comment("@gone @nobody")).toMatchObject({ ok: true, mentionedUserIds: [] });
    });
    it("excludes the author and dedupes", async () => {
      const r = await comment("@irsyad @Irsyad @syad @rina", "author");
      expect(r).toMatchObject({ ok: true, mentionedUserIds: [ids.irsyad] });
    });
    it("NOT_FOUND for unknown request; inactive author rejected", async () => {
      expect(await addCommentWith(db.prisma, actor("author", "REQUESTER"), "nope", "hi")).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await addCommentWith(db.prisma, actor("gone", "CREATIVE"), reqId, "hi")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    });
  });

  it("splitMentions highlights tokens and keeps all text", () => {
    const segs = splitMentions("hi @irsyad, ok");
    expect(segs.map((s) => s.text).join("")).toBe("hi @irsyad, ok");
    expect(segs.filter((s) => s.mention).map((s) => s.text)).toEqual(["@irsyad"]);
  });

  describe("setAssigneesWith", () => {
    const rows = async (id = reqId) => (await db.prisma.requestAssignee.findMany({ where: { requestId: id } })).map((r) => r.userId).sort();
    const sorted = (...k: string[]) => k.map((x) => ids[x]).sort();
    const calls: NotifyInput[] = [];
    const notifier = async (i: NotifyInput) => { calls.push(i); };
    const lead = () => actor("lead", "LEAD");
    beforeEach(async () => {
      calls.length = 0;
      await db.prisma.requestAssignee.deleteMany({ where: { requestId: reqId } });
    });

    it("stores several assignees and sends one ASSIGNED notification to all of them", async () => {
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.dimas, ids.irsyad] }, notifier)).toEqual({ ok: true, added: [ids.dimas, ids.irsyad], removed: [] });
      expect(await rows()).toEqual(sorted("dimas", "irsyad"));
      const assigned = calls.filter((c) => c.type === "ASSIGNED");
      expect(assigned).toHaveLength(1);
      expect(assigned[0]).toMatchObject({ userIds: [ids.dimas, ids.irsyad], actorId: ids.lead, requestId: reqId });
      expect(calls).toHaveLength(1);
    });
    it("removing someone notifies them with UNASSIGNED and sends no ASSIGNED", async () => {
      await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.dimas, ids.irsyad] }, notifier);
      calls.length = 0;
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { remove: [ids.dimas] }, notifier)).toEqual({ ok: true, added: [], removed: [ids.dimas] });
      expect(await rows()).toEqual([ids.irsyad]);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ type: "UNASSIGNED", userIds: [ids.dimas] });
    });
    it("removing everyone clears every assignee", async () => {
      await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.dimas, ids.irsyad] }, notifier);
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { remove: [ids.dimas, ids.irsyad] }, notifier)).toMatchObject({ ok: true, added: [], removed: expect.arrayContaining([ids.dimas, ids.irsyad]) });
      expect(await rows()).toEqual([]);
    });
    it("concurrent additions of different people both land", async () => {
      await Promise.all([
        setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.dimas] }, notifier),
        setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.irsyad] }, notifier),
      ]);
      expect(await rows()).toEqual(sorted("dimas", "irsyad"));
    });
    it("duplicates in the list store one row", async () => {
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.irsyad, ids.irsyad] }, notifier)).toMatchObject({ ok: true, added: [ids.irsyad] });
      expect(await rows()).toEqual([ids.irsyad]);
    });
    it("adding the same person again changes nothing and notifies nobody", async () => {
      await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.dimas] }, notifier);
      calls.length = 0;
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.dimas] }, notifier)).toEqual({ ok: true, added: [], removed: [] });
      expect(calls).toHaveLength(0);
    });
    it("a creative, or a requester on someone else's request, is forbidden", async () => {
      expect(await setAssigneesWith(db.prisma, actor("dimas", "CREATIVE"), reqId, { add: [ids.dimas] }, notifier)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await setAssigneesWith(db.prisma, actor("other", "REQUESTER"), reqId, { add: [ids.dimas] }, notifier)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await rows()).toEqual([]);
    });
    it("the requester can pick the designers for their own request", async () => {
      expect(await setAssigneesWith(db.prisma, actor("author", "REQUESTER"), reqId, { add: [ids.irsyad] }, notifier)).toMatchObject({ ok: true });
      expect(await rows()).toEqual([ids.irsyad]);
      expect(await setAssigneesWith(db.prisma, actor("author", "REQUESTER"), reqId, { remove: [ids.irsyad] }, notifier)).toMatchObject({ ok: true });
    });
    it("rejects an inactive person and leaves the existing rows alone", async () => {
      await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.dimas] }, notifier);
      const r = await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.irsyad, ids.gone] }, notifier);
      expect(r).toEqual({ ok: false, code: "INVALID", message: "That person is no longer active." });
      expect(await rows()).toEqual([ids.dimas]);
    });
    it("rejects requester-role people, unknown user/request, cancelled request", async () => {
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.author] }, notifier)).toMatchObject({ ok: false, code: "INVALID" });
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { add: ["nope"] }, notifier)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await setAssigneesWith(db.prisma, lead(), "nope", { add: [ids.dimas] }, notifier)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await setAssigneesWith(db.prisma, lead(), cancelledId, { add: [ids.dimas] }, notifier)).toEqual({ ok: false, code: "INVALID", message: "A cancelled request cannot be reassigned." });
      expect(await rows()).toEqual([]);
    });
    it("only adds members of the creative team", async () => {
      const r = await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.lead] }, notifier);
      expect(r).toEqual({ ok: false, code: "INVALID", message: "Only creative team members can be assignees." });
      expect(await rows()).toEqual([]);
    });
    it("an inactive person who is already assigned may stay while others are added", async () => {
      await db.prisma.requestAssignee.create({ data: { requestId: reqId, userId: ids.gone } });
      const r = await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.gone, ids.irsyad] }, notifier);
      expect(r).toEqual({ ok: true, added: [ids.irsyad], removed: [] });
      expect(await rows()).toEqual(sorted("gone", "irsyad"));
    });
    it("the actor never gets their own notification", async () => {
      // A lead who is also on the team adds themselves and a colleague: only the colleague hears about it.
      await setAssigneesWith(db.prisma, actor("dimas", "LEAD"), reqId, { add: [ids.dimas, ids.irsyad] }, notifier);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ type: "ASSIGNED", userIds: [ids.irsyad] });
      calls.length = 0;
      await setAssigneesWith(db.prisma, actor("dimas", "LEAD"), reqId, { remove: [ids.dimas] }, notifier);
      expect(calls).toHaveLength(0);
      await setAssigneesWith(db.prisma, actor("dimas", "LEAD"), reqId, { remove: [ids.irsyad] }, notifier);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ type: "UNASSIGNED", userIds: [ids.irsyad] });
    });
  });

  describe("setAssigneesWith applies one change against the current rows", () => {
    const rows = async () => (await db.prisma.requestAssignee.findMany({ where: { requestId: reqId } })).map((r) => r.userId).sort();
    const calls: NotifyInput[] = [];
    const notifier = async (i: NotifyInput) => { calls.push(i); };
    const lead = () => actor("lead", "LEAD");
    beforeEach(async () => {
      calls.length = 0;
      await db.prisma.requestAssignee.deleteMany({ where: { requestId: reqId } });
    });

    it("a stale tab adding someone keeps the person another tab added, and does not notify them", async () => {
      // Both tabs open with [dimas]. Tab 1 adds irsyad; tab 2 (still showing [dimas]) adds amb1.
      await db.prisma.requestAssignee.create({ data: { requestId: reqId, userId: ids.dimas } });
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.irsyad] }, notifier)).toEqual({ ok: true, added: [ids.irsyad], removed: [] });
      calls.length = 0;
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.amb1] }, notifier)).toEqual({ ok: true, added: [ids.amb1], removed: [] });
      expect(await rows()).toEqual([ids.dimas, ids.irsyad, ids.amb1].sort());
      expect(calls).toEqual([expect.objectContaining({ type: "ASSIGNED", userIds: [ids.amb1] })]);
      expect(calls.some((c) => c.userIds.includes(ids.irsyad))).toBe(false);
    });
    it("removing someone a stale tab still shows, but who is already gone, is a no-op with no notice", async () => {
      await db.prisma.requestAssignee.create({ data: { requestId: reqId, userId: ids.dimas } });
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { remove: [ids.irsyad] }, notifier)).toEqual({ ok: true, added: [], removed: [] });
      expect(await rows()).toEqual([ids.dimas]);
      expect(calls).toHaveLength(0);
    });
    it("adding someone already assigned is a no-op with no notice", async () => {
      await db.prisma.requestAssignee.create({ data: { requestId: reqId, userId: ids.dimas } });
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.dimas] }, notifier)).toEqual({ ok: true, added: [], removed: [] });
      expect(calls).toHaveLength(0);
    });
    it("rejects input that is not lists of ids, and more than 20 ids at once", async () => {
      const bad = [
        [ids.dimas],
        null,
        "x",
        { add: ids.dimas },
        { add: [ids.dimas, 7] },
        { remove: [{ id: ids.dimas }] },
        { add: Array.from({ length: 21 }, (_, i) => `u${i}`) },
        { remove: Array.from({ length: 21 }, (_, i) => `u${i}`) },
      ];
      for (const change of bad)
        expect(await setAssigneesWith(db.prisma, lead(), reqId, change as never, notifier)).toMatchObject({ ok: false, code: "INVALID" });
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { add: Array.from({ length: 21 }, (_, i) => `u${i}`) }, notifier))
        .toEqual({ ok: false, code: "INVALID", message: "Change at most 20 people at a time." });
      // Twenty-one copies of one id is one id.
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { add: Array(21).fill(ids.dimas) }, notifier)).toEqual({ ok: true, added: [ids.dimas], removed: [] });
      expect(await rows()).toEqual([ids.dimas]);
    });
    it("rejects the same person in add and remove", async () => {
      expect(await setAssigneesWith(db.prisma, lead(), reqId, { add: [ids.dimas], remove: [ids.dimas] }, notifier)).toMatchObject({ ok: false, code: "INVALID" });
      expect(await rows()).toEqual([]);
    });
  });

  describe("setAssigneesWith atomicity", () => {
    it("does not reassign a request that gets cancelled between the checks and the update", async () => {
      const p = db.prisma;
      const base = await p.request.findUniqueOrThrow({ where: { id: reqId } });
      const racing = await p.request.create({ data: { title: "race", brandId: base.brandId, divisionId: base.divisionId, typeId: base.typeId, requesterId: base.requesterId } });
      // Wrap the client so the request is cancelled right after setAssigneesWith reads it.
      const racy = new Proxy(p, {
        get(t, prop, recv) {
          if (prop !== "request") return Reflect.get(t, prop, recv);
          return new Proxy(t.request, {
            get(rt, rp) {
              const v = Reflect.get(rt, rp) as (...a: unknown[]) => unknown;
              if (rp !== "findUnique") return typeof v === "function" ? v.bind(rt) : v;
              let cancelled = false;
              return async (...a: unknown[]) => {
                const out = await v.apply(rt, a);
                if (!cancelled) { cancelled = true; await t.request.update({ where: { id: racing.id }, data: { status: "CANCELLED" } }); }
                return out;
              };
            },
          });
        },
      });
      const r = await setAssigneesWith(racy, actor("lead", "LEAD"), racing.id, { add: [ids.dimas] });
      expect(r).toMatchObject({ ok: false, code: "INVALID" });
      expect(await p.requestAssignee.count({ where: { requestId: racing.id } })).toBe(0);
    });
  });

  describe("addAttachmentWith", () => {
    const add = (name: string, url: string, id = reqId) => addAttachmentWith(db.prisma, actor("author", "REQUESTER"), id, { name, url });
    it("accepts http(s), trims name, leaves mime/size null", async () => {
      const r = await add("  Brief  ", " https://drive.google.com/x ");
      expect(r.ok).toBe(true);
      if (r.ok) expect(await db.prisma.attachment.findUnique({ where: { id: r.id } })).toMatchObject({ name: "Brief", url: "https://drive.google.com/x", mimeType: null, sizeBytes: null });
      expect((await add("a", "http://example.com")).ok).toBe(true);
    });
    it("accepts file-server paths", async () => {
      for (const u of ["\\\\192.168.1.10\\Design\\Brief 2026", "//192.168.1.10/Design", "smb://nas.local/design", "Z:\\Projects\\x"])
        expect((await add("server", u)).ok).toBe(true);
    });
    it("rejects dangerous schemes", async () => {
      for (const u of ["javascript:alert(1)", "data:text/html,x", "ftp://x.com/a", "notaurl", ""])
        expect(await add("n", u)).toMatchObject({ ok: false, code: "INVALID" });
    });
    it("validates the name and request", async () => {
      expect(await add("  ", "https://a.com")).toMatchObject({ ok: false, code: "INVALID" });
      expect(await add("a".repeat(201), "https://a.com")).toMatchObject({ ok: false, code: "INVALID" });
      expect(await add("a".repeat(200), "https://a.com")).toMatchObject({ ok: true });
      expect(await add("n", "https://a.com", "nope")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    });
    it("only uploader or lead may remove", async () => {
      const r = await add("rm", "https://a.com");
      if (!r.ok) throw new Error("setup");
      expect(await removeAttachmentWith(db.prisma, actor("dimas", "CREATIVE"), reqId, r.id)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await removeAttachmentWith(db.prisma, actor("lead", "LEAD"), reqId, r.id)).toEqual({ ok: true });
      expect(await removeAttachmentWith(db.prisma, actor("lead", "LEAD"), reqId, r.id)).toMatchObject({ code: "NOT_FOUND" });
    });
    it("is bound to the request: an attachment of another request is NOT_FOUND and survives", async () => {
      const r = await add("bound", "https://a.com");
      if (!r.ok) throw new Error("setup");
      expect(await removeAttachmentWith(db.prisma, actor("lead", "LEAD"), cancelledId, r.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await db.prisma.attachment.findUnique({ where: { id: r.id } })).not.toBeNull();
    });
    it("caps the url at 2048 characters", async () => {
      const url = (n: number) => "https://a.com/" + "x".repeat(n - 14);
      expect(await add("long", url(2049))).toMatchObject({ ok: false, code: "INVALID" });
      expect(await add("ok", url(2048))).toMatchObject({ ok: true });
    });
  });

  describe("recipients with several assignees", () => {
    const calls: NotifyInput[] = [];
    const notifier = async (i: NotifyInput) => { calls.push(i); };
    let shared: string;
    beforeEach(async () => {
      calls.length = 0;
      const base = await db.prisma.request.findUniqueOrThrow({ where: { id: reqId } });
      shared = (await db.prisma.request.create({ data: { title: "two owners", brandId: base.brandId, divisionId: base.divisionId, typeId: base.typeId, requesterId: ids.author } })).id;
      await db.prisma.requestAssignee.createMany({ data: [ids.dimas, ids.irsyad].map((userId) => ({ requestId: shared, userId })) });
    });
    const sortedIds = (c: NotifyInput) => [...c.userIds].sort();

    it("a comment notifies the requester and both assignees, not the author", async () => {
      await addCommentWith(db.prisma, actor("lead", "LEAD"), shared, "looks good", new Date(), notifier);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ type: "COMMENT" });
      expect(sortedIds(calls[0])).toEqual([ids.author, ids.dimas, ids.irsyad].sort());
    });
    it("a comment by an assignee reaches the other assignee and the requester only", async () => {
      await addCommentWith(db.prisma, actor("dimas", "CREATIVE"), shared, "on it", new Date(), notifier);
      expect(sortedIds(calls[0])).toEqual([ids.author, ids.irsyad].sort());
    });
    it("an assignee who is mentioned gets the mention, not a second comment notice", async () => {
      await addCommentWith(db.prisma, actor("lead", "LEAD"), shared, "@irsyad please check", new Date(), notifier);
      const mention = calls.find((c) => c.type === "MENTION");
      const plain = calls.find((c) => c.type === "COMMENT");
      expect(mention?.userIds).toEqual([ids.irsyad]);
      expect(sortedIds(plain!)).toEqual([ids.author, ids.dimas].sort());
    });
    it("a link notifies the requester and both assignees, not the uploader", async () => {
      await addAttachmentWith(db.prisma, actor("dimas", "CREATIVE"), shared, { name: "Final", url: "https://a.com/f" }, notifier);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ type: "ATTACHMENT" });
      expect(sortedIds(calls[0])).toEqual([ids.author, ids.irsyad].sort());
    });
  });
});
