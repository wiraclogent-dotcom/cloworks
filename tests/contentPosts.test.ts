import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { ContentError } from "@/lib/content/errors";
import { createChannelWith } from "@/lib/content/channels";
import {
  createPostWith, updatePostWith, setPostMediaWith, movePostWith, deletePostWith,
  submitPostWith, sendBackPostWith, addContentCommentWith,
} from "@/lib/content/posts";
import type { ContentActor } from "@/lib/content/permissions";

describe("content posts", () => {
  let db: TestDb;
  let lead: ContentActor;
  let creative: ContentActor;
  let requester: ContentActor;
  let social: ContentActor;
  let assigneeUser: ContentActor;
  let secondAssignee: ContentActor;
  let channelId: string;
  const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as ContentError; } };
  const feed = (u: ContentActor) => createPostWith(db.prisma, u, { channelId, surface: "FEED", kind: "PLANNED" });
  const post = (id: string) => db.prisma.contentPost.findUniqueOrThrow({ where: { id } });
  const mkMedia = async (n: string) => (await db.prisma.media.create({
    data: { publicId: `clowork/x/content/${n}`, type: "IMAGE", width: 1, height: 1, bytes: 1, uploadedById: lead.id },
  })).id;

  beforeAll(async () => {
    db = await createTestDb();
    const mk = async (email: string, appRole: "LEAD" | "CREATIVE" | "REQUESTER", jobRole?: "SOCIAL_MEDIA" | "OTHER") => {
      const u = await db.prisma.user.create({ data: { email, name: email.split("@")[0], fullName: email, appRole, ...(jobRole ? { jobRole } : {}) } });
      return { id: u.id, appRole, jobRole: u.jobRole } as ContentActor;
    };
    lead = await mk("plead@clogent.co.id", "LEAD");
    creative = await mk("pcreative@clogent.co.id", "CREATIVE");
    requester = await mk("preq@clogent.co.id", "REQUESTER", "OTHER");
    social = await mk("psocial@clogent.co.id", "REQUESTER", "SOCIAL_MEDIA");
    assigneeUser = await mk("passignee@clogent.co.id", "REQUESTER", "OTHER");
    secondAssignee = await mk("passignee2@clogent.co.id", "REQUESTER", "OTHER");
    const brand = await db.prisma.brand.create({ data: { name: "Post Brand" } });
    channelId = (await createChannelWith(db.prisma, lead, { brandId: brand.id, handle: "postbrand", displayName: "PB" })).id;
  });
  afterAll(async () => { await db?.stop(); });

  it("forbids a plain requester from creating, allows social media", async () => {
    expect((await code(feed(requester)))?.code).toBe("FORBIDDEN");
    const { id } = await feed(social);
    expect((await post(id)).status).toBe("IDEA");
  });

  it("new planned posts go to the top of the tab", async () => {
    const a = await feed(creative);
    const b = await feed(creative);
    expect((await post(b.id)).position).toBeGreaterThan((await post(a.id)).position);
  });

  it("published posts need publishedAt and sit at position 0", async () => {
    const mkPub = (publishedAt?: string) => createPostWith(db.prisma, creative, { channelId, surface: "FEED", kind: "PUBLISHED", publishedAt });
    expect((await code(mkPub()))?.fieldErrors?.publishedAt).toBeTruthy();
    expect((await code(mkPub("2026-02-31")))?.fieldErrors?.publishedAt).toBeTruthy();
    const { id } = await mkPub("2026-03-01");
    const p = await post(id);
    expect(p.position).toBe(0);
    expect(p.publishedAt?.toISOString()).toBe("2026-02-28T17:00:00.000Z");
    expect((await code(movePostWith(db.prisma, creative, id, null, null)))?.code).toBe("INVALID");
    expect((await code(submitPostWith(db.prisma, creative, id)))?.code).toBe("INVALID");
  });

  it("first save with a brief turns IDEA into DRAFT; blank brief does not", async () => {
    const { id } = await feed(creative);
    expect((await updatePostWith(db.prisma, creative, id, { brief: "   " })).status).toBe("IDEA");
    expect((await updatePostWith(db.prisma, creative, id, { brief: "Launch teaser" })).status).toBe("DRAFT");
  });

  it("rejects an invalid plannedAt", async () => {
    const { id } = await feed(creative);
    expect((await code(updatePostWith(db.prisma, creative, id, { plannedAt: "2026-13-01" })))?.fieldErrors?.plannedAt).toBeTruthy();
    await updatePostWith(db.prisma, creative, id, { plannedAt: "2026-11-05" });
    expect((await post(id)).plannedAt?.toISOString()).toBe("2026-11-04T17:00:00.000Z");
    await updatePostWith(db.prisma, creative, id, { plannedAt: null });
    expect((await post(id)).plannedAt).toBeNull();
  });

  it("submit without a date is INVALID; update after submit is LOCKED", async () => {
    const { id } = await feed(creative);
    await updatePostWith(db.prisma, creative, id, { brief: "Brief" });
    const e = await code(submitPostWith(db.prisma, creative, id));
    expect(e?.code).toBe("INVALID");
    expect(e?.fieldErrors?.plannedAt).toBeTruthy();
    await updatePostWith(db.prisma, creative, id, { plannedAt: "2026-12-01" });
    await submitPostWith(db.prisma, creative, id);
    const p = await post(id);
    expect(p.status).toBe("SUBMITTED");
    expect(p.submittedAt).not.toBeNull();
    expect((await code(updatePostWith(db.prisma, creative, id, { brief: "again" })))?.code).toBe("LOCKED");
    expect((await code(submitPostWith(db.prisma, creative, id)))?.code).toBe("LOCKED");
  });

  it("submit without a brief is INVALID with fieldErrors.brief", async () => {
    const { id } = await feed(creative);
    await updatePostWith(db.prisma, creative, id, { plannedAt: "2026-12-01" });
    expect((await code(submitPostWith(db.prisma, creative, id)))?.fieldErrors?.brief).toBeTruthy();
  });

  it("send back: creative forbidden, empty note invalid, note moves to CHANGES_REQUESTED with a feedback comment", async () => {
    const { id } = await feed(creative);
    await updatePostWith(db.prisma, creative, id, { brief: "B", plannedAt: "2026-12-02" });
    await submitPostWith(db.prisma, creative, id);
    expect((await code(sendBackPostWith(db.prisma, creative, id, "no")))?.code).toBe("FORBIDDEN");
    expect((await code(sendBackPostWith(db.prisma, lead, id, "  ")))?.code).toBe("INVALID");
    await sendBackPostWith(db.prisma, lead, id, "Needs a stronger hook");
    expect((await post(id)).status).toBe("CHANGES_REQUESTED");
    const c = await db.prisma.contentComment.findFirstOrThrow({ where: { postId: id } });
    expect(c.isFeedback).toBe(true);
    expect(c.body).toBe("Needs a stronger hook");
    expect((await updatePostWith(db.prisma, creative, id, { caption: "ok" })).status).toBe("CHANGES_REQUESTED");
    // a second send back is stale
    expect((await code(sendBackPostWith(db.prisma, lead, id, "again")))?.code).toBe("CONFLICT");
  });

  it("move puts a post strictly between two others; moves only editable posts in the same tab", async () => {
    const a = await feed(creative);
    const b = await feed(creative);
    const c = await feed(creative);
    // list order top to bottom: c, b, a. Move a between c and b.
    await movePostWith(db.prisma, creative, a.id, c.id, b.id);
    const [pa, pb, pc] = [await post(a.id), await post(b.id), await post(c.id)];
    expect(pa.position).toBeLessThan(pc.position);
    expect(pa.position).toBeGreaterThan(pb.position);
    const story = await createPostWith(db.prisma, creative, { channelId, surface: "STORY", kind: "PLANNED" });
    expect((await code(movePostWith(db.prisma, creative, a.id, story.id, null)))?.code).toBe("NOT_FOUND");
    await updatePostWith(db.prisma, creative, a.id, { brief: "x", plannedAt: "2026-12-03" });
    await submitPostWith(db.prisma, creative, a.id);
    expect((await code(movePostWith(db.prisma, creative, a.id, null, null)))?.code).toBe("LOCKED");
  });

  it("renumbers when neighbours are too close", async () => {
    const a = await feed(creative);
    const b = await feed(creative);
    const c = await feed(creative);
    await db.raw.contentPost.update({ where: { id: b.id }, data: { position: (await post(c.id)).position - 1e-9 } });
    await movePostWith(db.prisma, creative, a.id, c.id, b.id);
    const [pa, pb, pc] = [await post(a.id), await post(b.id), await post(c.id)];
    expect(pc.position).toBeGreaterThan(pa.position);
    expect(pa.position).toBeGreaterThan(pb.position);
  });

  it("delete: author or approver only, and not after APPROVED", async () => {
    const { id } = await feed(creative);
    expect((await code(deletePostWith(db.prisma, social, id)))?.code).toBe("FORBIDDEN");
    await deletePostWith(db.prisma, lead, id);
    expect(await db.prisma.contentPost.count({ where: { id } })).toBe(0);
    const ap = await feed(creative);
    await db.raw.contentPost.update({ where: { id: ap.id }, data: { status: "APPROVED" } });
    expect((await code(deletePostWith(db.prisma, creative, ap.id)))?.code).toBe("INVALID");
  });

  it("media: replaces mockups in order, reports unlinked ids, flips IDEA to DRAFT", async () => {
    const { id } = await feed(creative);
    const [m1, m2, m3] = [await mkMedia("m1"), await mkMedia("m2"), await mkMedia("m3")];
    const r1 = await setPostMediaWith(db.prisma, creative, id, [{ mediaId: m1, role: "MOCKUP" }, { mediaId: m2, role: "MOCKUP" }]);
    expect(r1.removedMediaIds).toEqual([]);
    expect((await post(id)).status).toBe("DRAFT");
    const r2 = await setPostMediaWith(db.prisma, creative, id, [{ mediaId: m3, role: "MOCKUP" }, { mediaId: m1, role: "MOCKUP" }]);
    expect(r2.removedMediaIds).toEqual([m2]);
    const links = await db.prisma.contentPostMedia.findMany({ where: { postId: id }, orderBy: { order: "asc" } });
    expect(links.map((l) => l.mediaId)).toEqual([m3, m1]);
  });

  it("media: unknown media is NOT_FOUND, FINAL while editable is LOCKED, non-drafter is FORBIDDEN", async () => {
    const { id } = await feed(creative);
    expect((await code(setPostMediaWith(db.prisma, creative, id, [{ mediaId: "nope", role: "MOCKUP" }])))?.code).toBe("NOT_FOUND");
    const m = await mkMedia("m4");
    expect((await code(setPostMediaWith(db.prisma, creative, id, [{ mediaId: m, role: "FINAL" }])))?.code).toBe("LOCKED");
    expect((await code(setPostMediaWith(db.prisma, requester, id, [{ mediaId: m, role: "MOCKUP" }])))?.code).toBe("FORBIDDEN");
  });

  it("media: locked statuses refuse edits; FINAL in production needs a drafter or the request assignee", async () => {
    const { id } = await feed(creative);
    const m = await mkMedia("m5");
    await db.raw.contentPost.update({ where: { id }, data: { status: "SUBMITTED" } });
    expect((await code(setPostMediaWith(db.prisma, creative, id, [{ mediaId: m, role: "MOCKUP" }])))?.code).toBe("LOCKED");
    const brand = await db.prisma.brand.findFirstOrThrow();
    const div = await db.prisma.division.create({ data: { name: "PD" } });
    const type = await db.prisma.requestType.create({ data: { name: "PT" } });
    const req = await db.prisma.request.create({
      data: { title: "r", brandId: brand.id, divisionId: div.id, typeId: type.id, requesterId: creative.id },
    });
    await db.prisma.requestAssignee.createMany({ data: [{ requestId: req.id, userId: assigneeUser.id }, { requestId: req.id, userId: secondAssignee.id }] });
    await db.raw.contentPost.update({ where: { id }, data: { status: "IN_PRODUCTION", requestId: req.id } });
    expect((await code(setPostMediaWith(db.prisma, requester, id, [{ mediaId: m, role: "FINAL" }])))?.code).toBe("FORBIDDEN");
    expect((await code(setPostMediaWith(db.prisma, assigneeUser, id, [{ mediaId: m, role: "MOCKUP" }])))?.code).toBe("LOCKED");
    // Any assignee may add finals, not just the first one.
    await setPostMediaWith(db.prisma, secondAssignee, id, [{ mediaId: m, role: "FINAL" }]);
    expect((await db.prisma.contentPostMedia.findMany({ where: { postId: id } })).map((l) => l.role)).toEqual(["FINAL"]);
    expect((await post(id)).status).toBe("IN_PRODUCTION");
  });

  it("delete returns media ids that nothing else uses", async () => {
    const { id } = await feed(creative);
    const other = await feed(creative);
    const [own, shared] = [await mkMedia("m6"), await mkMedia("m7")];
    await setPostMediaWith(db.prisma, creative, id, [{ mediaId: own, role: "MOCKUP" }, { mediaId: shared, role: "MOCKUP" }]);
    await setPostMediaWith(db.prisma, creative, other.id, [{ mediaId: shared, role: "MOCKUP" }]);
    const r = await deletePostWith(db.prisma, creative, id);
    expect(r.mediaIds).toEqual([own]);
  });

  it("mockup media counts as content on save", async () => {
    const { id } = await feed(creative);
    const m = await mkMedia("m8");
    await setPostMediaWith(db.prisma, creative, id, [{ mediaId: m, role: "MOCKUP" }]);
    await db.raw.contentPost.update({ where: { id }, data: { status: "IDEA" } });
    expect((await updatePostWith(db.prisma, creative, id, { caption: "c" })).status).toBe("DRAFT");
  });

  it("comments: any member, trimmed, 1..2000 chars, returns mentions, allowed when locked", async () => {
    const { id } = await feed(creative);
    await db.raw.contentPost.update({ where: { id }, data: { status: "APPROVED" } });
    expect((await code(addContentCommentWith(db.prisma, requester, id, "   ")))?.code).toBe("INVALID");
    expect((await code(addContentCommentWith(db.prisma, requester, id, "x".repeat(2001))))?.code).toBe("INVALID");
    expect((await code(addContentCommentWith(db.prisma, requester, "nope", "hi")))?.code).toBe("NOT_FOUND");
    const r = await addContentCommentWith(db.prisma, requester, id, "  hi @pcreative  ");
    expect(r.mentionedUserIds).toEqual([creative.id]);
    const c = await db.prisma.contentComment.findUniqueOrThrow({ where: { id: r.id } });
    expect(c.body).toBe("hi @pcreative");
    expect(c.isFeedback).toBe(false);
  });

  it("media edit after a submit from another tab is refused and leaves the links alone", async () => {
    const { id } = await feed(creative);
    const [m1, m2] = [await mkMedia("m9"), await mkMedia("m10")];
    await setPostMediaWith(db.prisma, creative, id, [{ mediaId: m1, role: "MOCKUP" }]);
    await db.raw.contentPost.update({ where: { id }, data: { status: "SUBMITTED" } });
    expect((await code(setPostMediaWith(db.prisma, creative, id, [{ mediaId: m2, role: "MOCKUP" }])))?.code).toBe("LOCKED");
    expect((await db.prisma.contentPostMedia.findMany({ where: { postId: id } })).map((l) => l.mediaId)).toEqual([m1]);
  });

  it("a stale status guard rolls the whole media swap back", async () => {
    const { id } = await feed(creative);
    const [m1, m2] = [await mkMedia("m11"), await mkMedia("m12")];
    await setPostMediaWith(db.prisma, creative, id, [{ mediaId: m1, role: "MOCKUP" }]);
    // The post is read first, then flips to SUBMITTED before the write: simulate by flipping between the two queries.
    const orig = db.prisma.contentPostMedia.findMany;
    const spy = (db.prisma.contentPostMedia as unknown as { findMany: unknown });
    spy.findMany = async (...a: Parameters<typeof orig>) => {
      const r = await orig.apply(db.prisma.contentPostMedia, a);
      await db.raw.contentPost.update({ where: { id }, data: { status: "SUBMITTED" } });
      return r;
    };
    try {
      expect((await code(setPostMediaWith(db.prisma, creative, id, [{ mediaId: m2, role: "MOCKUP" }])))?.code).toBe("CONFLICT");
    } finally {
      spy.findMany = orig;
    }
    expect((await db.prisma.contentPostMedia.findMany({ where: { postId: id } })).map((l) => l.mediaId)).toEqual([m1]);
  });

  it("brief and caption are length checked", async () => {
    const { id } = await feed(creative);
    expect((await code(updatePostWith(db.prisma, creative, id, { brief: "x".repeat(5001) })))?.fieldErrors?.brief).toBeTruthy();
    expect((await code(updatePostWith(db.prisma, creative, id, { caption: "x".repeat(2201) })))?.fieldErrors?.caption).toBeTruthy();
    expect((await code(updatePostWith(db.prisma, creative, id, { brief: 5 as unknown as string })))?.fieldErrors?.brief).toBeTruthy();
    await updatePostWith(db.prisma, creative, id, { brief: "x".repeat(5000), caption: "x".repeat(2200) });
  });

  it("rows from another workspace are NOT_FOUND: channel, media and request type", async () => {
    const ws = await db.raw.workspace.create({ data: { name: "Other posts", slug: "other-posts-ws" } });
    const brand = await db.raw.brand.create({ data: { name: "Foreign", workspaceId: ws.id } });
    const channel = await db.raw.socialChannel.create({
      data: { brandId: brand.id, platform: "INSTAGRAM", handle: "foreign", displayName: "F", position: 1, workspaceId: ws.id },
    });
    const media = await db.raw.media.create({
      data: { publicId: "clowork/other/content/f", type: "IMAGE", width: 1, height: 1, bytes: 1, uploadedById: lead.id, workspaceId: ws.id },
    });
    const type = await db.raw.requestType.create({ data: { name: "Foreign type", workspaceId: ws.id } });

    expect((await code(createPostWith(db.prisma, creative, { channelId: channel.id, surface: "FEED", kind: "PLANNED" })))?.code).toBe("NOT_FOUND");
    const { id } = await feed(creative);
    expect((await code(setPostMediaWith(db.prisma, creative, id, [{ mediaId: media.id, role: "MOCKUP" }])))?.code).toBe("NOT_FOUND");
    expect((await code(updatePostWith(db.prisma, creative, id, { typeId: type.id })))?.code).toBe("NOT_FOUND");
    expect(await db.prisma.contentPostMedia.count({ where: { postId: id } })).toBe(0);
    expect((await post(id)).typeId).toBeNull();
  });

  it("create validates surface and kind; update validates format", async () => {
    const mk = (surface: string, kind: string) =>
      code(createPostWith(db.prisma, creative, { channelId, surface: surface as "FEED", kind: kind as "PLANNED" }));
    expect((await mk("TIKTOK", "PLANNED"))?.code).toBe("INVALID");
    expect((await mk("FEED", "ARCHIVED"))?.code).toBe("INVALID");
    const { id } = await feed(creative);
    expect((await code(updatePostWith(db.prisma, creative, id, { format: "GIF" as "SINGLE" })))?.fieldErrors?.format).toBeTruthy();
    await updatePostWith(db.prisma, creative, id, { format: "VIDEO" });
    expect((await post(id)).format).toBe("VIDEO");
  });
});
