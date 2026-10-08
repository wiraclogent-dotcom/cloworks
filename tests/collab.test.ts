import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { addCommentWith, assignRequestWith, addAttachmentWith, removeAttachmentWith, splitMentions } from "@/lib/collab";
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
      ids[k] = (await p.user.create({ data: { email: `${k}@clogent.co.id`, name, fullName: name, appRole, ...extra } })).id;
    };
    await mk("author", "Rina", "REQUESTER");
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

  describe("assignRequestWith", () => {
    it("lead can assign and unassign", async () => {
      expect(await assignRequestWith(db.prisma, actor("lead", "LEAD"), reqId, ids.dimas)).toEqual({ ok: true });
      expect((await db.prisma.request.findUnique({ where: { id: reqId } }))?.assigneeId).toBe(ids.dimas);
      expect(await assignRequestWith(db.prisma, actor("lead", "LEAD"), reqId, null)).toEqual({ ok: true });
      expect((await db.prisma.request.findUnique({ where: { id: reqId } }))?.assigneeId).toBeNull();
    });
    it("creative and requester are forbidden", async () => {
      expect(await assignRequestWith(db.prisma, actor("dimas", "CREATIVE"), reqId, ids.dimas)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await assignRequestWith(db.prisma, actor("author", "REQUESTER"), reqId, ids.dimas)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    });
    it("rejects inactive and requester-role assignees, unknown user/request, cancelled request", async () => {
      const lead = actor("lead", "LEAD");
      expect(await assignRequestWith(db.prisma, lead, reqId, ids.gone)).toMatchObject({ ok: false, code: "INVALID" });
      expect(await assignRequestWith(db.prisma, lead, reqId, ids.author)).toMatchObject({ ok: false, code: "INVALID" });
      expect(await assignRequestWith(db.prisma, lead, reqId, "nope")).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await assignRequestWith(db.prisma, lead, "nope", ids.dimas)).toMatchObject({ ok: false, code: "NOT_FOUND" });
      expect(await assignRequestWith(db.prisma, lead, cancelledId, ids.dimas)).toMatchObject({ ok: false, code: "INVALID" });
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
      expect(await removeAttachmentWith(db.prisma, actor("dimas", "CREATIVE"), r.id)).toMatchObject({ ok: false, code: "FORBIDDEN" });
      expect(await removeAttachmentWith(db.prisma, actor("lead", "LEAD"), r.id)).toEqual({ ok: true });
      expect(await removeAttachmentWith(db.prisma, actor("lead", "LEAD"), r.id)).toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
