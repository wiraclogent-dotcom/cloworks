import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { notifyContentWith, commentRecipients, CONTENT_NOTIFICATION, type ContentNotice } from "@/lib/content/notify";
import { notificationHref } from "@/lib/notificationLinks";
import { createChannelWith } from "@/lib/content/channels";
import { transitionRequestWith } from "@/lib/transition";
import { approveContentPostWith } from "@/lib/content/approve";
import type { ContentActor } from "@/lib/content/permissions";
import type { Mailer } from "@/lib/mailer";

describe("content notifications", () => {
  let db: TestDb;
  let lead1: string, lead2: string, admin: string, author: string, other: string, goneLead: string;
  let channelId: string;
  let postId: string;
  const sent: Parameters<Mailer["send"]>[0][] = [];
  const mailer: Mailer = { send: async (m) => { sent.push(m); } };
  const BASE = { baseUrl: "https://app.example.com" };
  const notify = (n: ContentNotice) => notifyContentWith(db.prisma, mailer, n, BASE);
  const rows = () => db.raw.notification.findMany({ where: { type: CONTENT_NOTIFICATION, contentPostId: postId }, orderBy: { createdAt: "asc" } });
  const clear = async () => { sent.length = 0; await db.raw.notification.deleteMany({}); };

  beforeAll(async () => {
    db = await createTestDb();
    const mk = (name: string, appRole: "LEAD" | "ADMIN" | "CREATIVE", active = true) =>
      db.prisma.user.create({ data: { email: `${name.toLowerCase()}@clogent.co.id`, name, fullName: name, appRole, active } }).then((u) => u.id);
    [lead1, lead2, admin, author, other, goneLead] = await Promise.all([
      mk("Lead1", "LEAD"), mk("Lead2", "LEAD"), mk("Admin", "ADMIN"), mk("Author", "CREATIVE"), mk("Other", "CREATIVE"), mk("Gone", "LEAD", false),
    ]);
    const brand = await db.prisma.brand.create({ data: { name: "Notify Brand" } });
    channelId = (await createChannelWith(db.prisma, { id: lead1, appRole: "LEAD", jobRole: "DESIGNER" } as ContentActor, { brandId: brand.id, handle: "notifybrand", displayName: "NB" })).id;
    postId = (await db.prisma.contentPost.create({
      data: { channelId, surface: "FEED", format: "SINGLE", status: "SUBMITTED", position: 1, authorId: author, brief: "\n  Summer launch teaser\nsecond line", plannedAt: new Date("2099-02-01T00:00:00+07:00") },
    })).id;
  });
  afterAll(async () => { await db?.stop(); });

  it("submitted: bell rows for active leads and admins except the actor, no email", async () => {
    await clear();
    await notify({ kind: "submitted", postId, actorId: lead1 });
    const r = await rows();
    expect(r.map((x) => x.userId).sort()).toEqual([lead2, admin].sort());
    expect(r.every((x) => x.requestId === null && x.emailedAt === null && x.readAt === null)).toBe(true);
    expect(r[0].message).toBe("Lead1 submitted “Summer launch teaser” for approval");
    expect(sent).toHaveLength(0);
    expect(notificationHref(r[0])).toBe(`/content?post=${postId}`);
  });

  it("approved: one row and one email to the author with the Open post link; the actor is never notified", async () => {
    await clear();
    await notify({ kind: "approved", postId, actorId: lead1 });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].userId).toBe(author);
    expect(r[0].message).toBe("Lead1 approved “Summer launch teaser” — request created");
    expect(r[0].emailedAt).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("author@clogent.co.id");
    expect(sent[0].subject).toBe("Post approved: Summer launch teaser");
    expect(sent[0].html).toContain("Open post");
    expect(sent[0].html).toContain(`https://app.example.com/content?post=${postId}`);
    expect(sent[0].text).toContain(`https://app.example.com/content?post=${postId}`);

    await clear();
    await notify({ kind: "approved", postId, actorId: author });
    expect(await rows()).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it("sentBack: emails the author with the cleaned, capped note", async () => {
    await clear();
    await notify({ kind: "sentBack", postId, actorId: lead2, note: `Fix\nthe hook ${"x".repeat(200)}` });
    const [r] = await rows();
    expect(r.message.startsWith("Lead2 sent back “Summer launch teaser”: Fix the hook xxx")).toBe(true);
    expect(r.message.endsWith("…")).toBe(true);
    expect(r.message.split(": ")[1].length).toBe(120);
    expect(sent.map((m) => m.subject)).toEqual(["Post sent back: Summer launch teaser"]);
  });

  it("cancelled and comment: bell only; comment goes to the given users minus the actor", async () => {
    await clear();
    await notify({ kind: "cancelled", postId, actorId: lead1 });
    expect((await rows()).map((x) => [x.userId, x.message])).toEqual([[author, "The request for “Summer launch teaser” was cancelled; the post is back in draft"]]);
    await clear();
    await notify({ kind: "comment", postId, actorId: other, userIds: [author, other, lead1, goneLead] });
    expect((await rows()).map((x) => x.userId).sort()).toEqual([author, lead1].sort());
    expect(sent).toHaveLength(0);
  });

  it("falls back to Untitled post and never throws", async () => {
    await clear();
    const blank = await db.prisma.contentPost.create({ data: { channelId, surface: "FEED", format: "SINGLE", position: 2, authorId: author, brief: "  \n " } });
    await notify({ kind: "cancelled", postId: blank.id, actorId: lead1 });
    expect((await db.raw.notification.findFirstOrThrow({ where: { contentPostId: blank.id } })).message).toContain("“Untitled post”");
    const failing: Mailer = { send: async () => { throw new Error("boom"); } };
    await expect(notifyContentWith(db.prisma, failing, { kind: "approved", postId, actorId: lead1 }, BASE)).resolves.toBeUndefined();
    await expect(notify({ kind: "approved", postId: "missing", actorId: lead1 })).resolves.toBeUndefined();
  });

  it("commentRecipients: author + earlier commenters + mentions, minus the actor", async () => {
    await db.prisma.contentComment.create({ data: { postId, authorId: lead2, body: "first" } });
    await db.prisma.contentComment.create({ data: { postId, authorId: lead2, body: "again" } });
    await db.prisma.contentComment.create({ data: { postId, authorId: other, body: "mine" } });
    const ids = await commentRecipients(db.prisma, postId, other, [admin]);
    expect(ids.sort()).toEqual([author, lead2, admin].sort());
  });

  it("cancelling the request tells the post's author", async () => {
    await clear();
    const divisionId = (await db.prisma.division.create({ data: { name: "N Div" } })).id;
    await db.prisma.requestType.create({ data: { name: "General Design" } });
    const leadActor = { id: lead1, appRole: "LEAD", jobRole: "DESIGNER" } as ContentActor;
    const { requestId } = await approveContentPostWith(db.prisma, leadActor, postId, { title: "Cancel me", divisionId, deadline: "2099-01-01", outputCount: 1 });
    await transitionRequestWith(db.prisma, leadActor, requestId, "CANCELLED", {}, async () => {});
    const r = await db.raw.notification.findMany({ where: { contentPostId: postId, userId: author } });
    expect(r.map((x) => x.message)).toEqual(["The request for “Summer launch teaser” was cancelled; the post is back in draft"]);
  });
});
