import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { createChannelWith } from "@/lib/content/channels";
import { createPostWith } from "@/lib/content/posts";
import { loadPostPanel } from "@/lib/content/panelView";
import type { ContentActor } from "@/lib/content/permissions";

const CLOUD = "demo";

describe("loadPostPanel", () => {
  let db: TestDb;
  let lead: ContentActor;
  let creative: ContentActor;
  let requester: ContentActor;
  let assignee: ContentActor;
  let secondAssignee: ContentActor;
  let channelId: string;
  const ids: Record<string, string> = {};

  const mkMedia = async (n: string, type: "IMAGE" | "VIDEO" = "IMAGE") => (await db.prisma.media.create({
    data: { publicId: `clowork/x/content/${n}`, type, width: 1, height: 1, bytes: 1, uploadedById: lead.id },
  })).id;
  const planned = async (author: ContentActor = creative) => (await createPostWith(db.prisma, author, { channelId, surface: "FEED", kind: "PLANNED" })).id;
  const set = (id: string, data: Record<string, unknown>) => db.prisma.contentPost.update({ where: { id }, data });

  beforeAll(async () => {
    db = await createTestDb();
    const mk = async (email: string, appRole: "LEAD" | "CREATIVE" | "REQUESTER") => {
      const u = await db.prisma.user.create({ data: { email, name: email.split("@")[0], fullName: email, appRole, jobRole: "OTHER" } });
      return { id: u.id, appRole, jobRole: u.jobRole } as ContentActor;
    };
    lead = await mk("plead@clogent.co.id", "LEAD");
    creative = await mk("pcreative@clogent.co.id", "CREATIVE");
    requester = await mk("preq@clogent.co.id", "REQUESTER");
    assignee = await mk("passignee@clogent.co.id", "REQUESTER");
    secondAssignee = await mk("passignee2@clogent.co.id", "REQUESTER");
    const brand = await db.prisma.brand.create({ data: { name: "Panel Brand" } });
    channelId = (await createChannelWith(db.prisma, lead, { brandId: brand.id, handle: "panel", displayName: "Panel" })).id;

    // Feed top → bottom: draft 12 Nov, submitted 10 Nov, in production 20 Nov (each new post goes to the top).
    ids.approved = await planned();
    ids.submitted = await planned();
    ids.draft = await planned();
    await set(ids.draft, { status: "DRAFT", plannedAt: new Date("2026-11-12T00:00:00+07:00"), brief: "Promo", caption: "Hi", format: "CAROUSEL" });
    await set(ids.submitted, { status: "SUBMITTED", plannedAt: new Date("2026-11-10T00:00:00+07:00"), submittedAt: new Date("2026-10-12T03:00:00Z") });
    await set(ids.approved, { status: "IN_PRODUCTION", plannedAt: new Date("2026-11-20T00:00:00+07:00") });

    const division = await db.prisma.division.create({ data: { name: "Panel Div" } });
    const type = await db.prisma.requestType.create({ data: { name: "Panel Type", fieldSchema: [] } });
    const req = await db.prisma.request.create({
      data: { title: "R", brandId: brand.id, divisionId: division.id, typeId: type.id, requesterId: creative.id, status: "ON_PROGRESS" },
    });
    await db.prisma.requestAssignee.createMany({ data: [assignee, secondAssignee].map((a) => ({ requestId: req.id, userId: a.id })) });
    await set(ids.approved, { requestId: req.id });
    ids.request = req.id;

    const img = await mkMedia("img");
    const clip = await mkMedia("clip", "VIDEO");
    const fin = await mkMedia("fin");
    await db.prisma.contentPostMedia.createMany({ data: [
      { postId: ids.draft, mediaId: img, role: "MOCKUP", order: 1 },
      { postId: ids.draft, mediaId: clip, role: "MOCKUP", order: 0 },
      { postId: ids.approved, mediaId: fin, role: "FINAL", order: 0 },
    ] });
    await db.prisma.contentComment.create({ data: { postId: ids.draft, authorId: lead.id, body: "Fix the price", isFeedback: true, createdAt: new Date("2026-10-11T00:00:00Z") } });
    await db.prisma.contentComment.create({ data: { postId: ids.draft, authorId: creative.id, body: "Done", createdAt: new Date("2026-10-12T00:00:00Z") } });

    const ws = await db.raw.workspace.create({ data: { name: "Other", slug: "other-panel" } });
    const fBrand = await db.raw.brand.create({ data: { name: "Foreign", workspaceId: ws.id } });
    const fChannel = await db.raw.socialChannel.create({
      data: { brandId: fBrand.id, platform: "INSTAGRAM", handle: "foreign", displayName: "F", position: 0, workspaceId: ws.id },
    });
    ids.foreign = (await db.raw.contentPost.create({ data: { channelId: fChannel.id, surface: "FEED", position: 0, authorId: lead.id, workspaceId: ws.id } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  it("returns the post, ordered media with panel/poster urls, comments and types", async () => {
    const v = (await loadPostPanel(db.prisma, creative, ids.draft, CLOUD))!;
    expect(v.post).toMatchObject({
      id: ids.draft, status: "DRAFT", kind: "PLANNED", surface: "FEED", format: "CAROUSEL", plannedAt: "2026-11-12",
      brief: "Promo", caption: "Hi", channelId, author: { id: creative.id, name: "pcreative" }, request: null,
    });
    expect(v.mockups.map((m) => m.type)).toEqual(["VIDEO", "IMAGE"]);
    expect(v.mockups[0].url).toBe("https://res.cloudinary.com/demo/video/upload/c_fill,ar_3:4,w_360,f_auto,q_auto/so_0/clowork/x/content/clip.jpg");
    expect(v.mockups[1].url).toBe("https://res.cloudinary.com/demo/image/upload/c_limit,w_900,f_auto,q_auto/clowork/x/content/img");
    expect(v.finals).toEqual([]);
    expect(v.comments.map((c) => [c.authorName, c.body, c.isFeedback])).toEqual([["plead", "Fix the price", true], ["pcreative", "Done", false]]);
    expect(v.types.length).toBeGreaterThan(0);
    expect(v.mediaReady).toBe(true);
  });

  it("builds no urls without media storage", async () => {
    const v = (await loadPostPanel(db.prisma, creative, ids.draft, null))!;
    expect(v.mockups.every((m) => m.url === null)).toBe(true);
    expect(v.mediaReady).toBe(false);
  });

  it("sets permission flags per role and status", async () => {
    const draftAs = async (u: ContentActor) => (await loadPostPanel(db.prisma, u, ids.draft, CLOUD))!.can;
    expect(await draftAs(creative)).toEqual({ edit: true, submit: true, approve: false, comment: true, delete: true, addFinal: false });
    expect(await draftAs(requester)).toEqual({ edit: false, submit: false, approve: false, comment: true, delete: false, addFinal: false });
    expect(await draftAs(lead)).toMatchObject({ edit: true, approve: false, delete: true });

    const subAs = async (u: ContentActor) => (await loadPostPanel(db.prisma, u, ids.submitted, CLOUD))!.can;
    expect(await subAs(creative)).toMatchObject({ edit: false, submit: false, approve: false, delete: true });
    expect(await subAs(lead)).toMatchObject({ edit: false, approve: true, delete: true });

    const prodAs = async (u: ContentActor) => (await loadPostPanel(db.prisma, u, ids.approved, CLOUD))!.can;
    expect(await prodAs(lead)).toMatchObject({ edit: false, approve: false, delete: false, addFinal: true });
    expect(await prodAs(assignee)).toMatchObject({ addFinal: true, edit: false });
    expect(await prodAs(secondAssignee)).toMatchObject({ addFinal: true, edit: false });
    expect(await prodAs(requester)).toMatchObject({ addFinal: false });
  });

  it("links the request and lists finals once approved", async () => {
    const v = (await loadPostPanel(db.prisma, lead, ids.approved, CLOUD))!;
    expect(v.post.request).toEqual({ id: ids.request, status: "ON_PROGRESS" });
    expect(v.finals).toHaveLength(1);
  });

  it("suggests a date only for an out-of-order tile", async () => {
    // Top → bottom: draft 12 Nov, submitted 10 Nov, in production 20 Nov (later than 10 Nov above it).
    expect((await loadPostPanel(db.prisma, creative, ids.draft, CLOUD))!.warnDate).toBeNull();
    expect((await loadPostPanel(db.prisma, creative, ids.approved, CLOUD))!.warnDate).toBe("2026-11-09");
  });

  it("returns the submitter and time", async () => {
    const v = (await loadPostPanel(db.prisma, lead, ids.submitted, CLOUD))!;
    expect(v.post.submittedAt).toBe("2026-10-12T03:00:00.000Z");
  });

  it("returns null for another workspace's or an unknown post", async () => {
    expect(await loadPostPanel(db.prisma, lead, ids.foreign, CLOUD)).toBeNull();
    expect(await loadPostPanel(db.prisma, lead, "nope", CLOUD)).toBeNull();
  });
});
