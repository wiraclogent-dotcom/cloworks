import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { createChannelWith } from "@/lib/content/channels";
import { createPostWith } from "@/lib/content/posts";
import { loadContentPlan } from "@/lib/content/view";
import type { ContentActor } from "@/lib/content/permissions";

const CLOUD = "demo";

describe("loadContentPlan", () => {
  let db: TestDb;
  let lead: ContentActor;
  let requester: ContentActor;
  let first: string; // new channels join the end of the list, so this one is listed first
  let second: string;
  const ids: Record<string, string> = {};

  const mkMedia = async (n: string, type: "IMAGE" | "VIDEO" = "IMAGE") => (await db.prisma.media.create({
    data: { publicId: `clowork/x/content/${n}`, type, width: 1, height: 1, bytes: 1, uploadedById: lead.id },
  })).id;
  const planned = async (channelId: string, surface: "FEED" | "REEL" | "STORY" = "FEED") =>
    (await createPostWith(db.prisma, lead, { channelId, surface, kind: "PLANNED" })).id;
  const set = (id: string, data: Record<string, unknown>) => db.prisma.contentPost.update({ where: { id }, data });

  beforeAll(async () => {
    db = await createTestDb();
    const mk = async (email: string, appRole: "LEAD" | "REQUESTER") => {
      const u = await db.prisma.user.create({ data: { email, name: email.split("@")[0], fullName: email, appRole, jobRole: "OTHER" } });
      return { id: u.id, appRole, jobRole: u.jobRole } as ContentActor;
    };
    lead = await mk("vlead@clogent.co.id", "LEAD");
    requester = await mk("vreq@clogent.co.id", "REQUESTER");
    const brand = await db.prisma.brand.create({ data: { name: "View Brand" } });
    const avatar = await mkMedia("avatar");
    first = (await createChannelWith(db.prisma, lead, { brandId: brand.id, handle: "first", displayName: "First", bio: "Hello", avatarMediaId: avatar })).id;
    second = (await createChannelWith(db.prisma, lead, { brandId: brand.id, handle: "second", displayName: "Second" })).id;

    // Feed, created bottom → top (each new planned post goes to the top).
    ids.bottom = await planned(first);
    ids.middle = await planned(first);
    ids.top = await planned(first);
    await set(ids.bottom, { plannedAt: new Date("2026-11-01T00:00:00+07:00") });
    await set(ids.middle, { plannedAt: new Date("2026-11-10T00:00:00+07:00"), status: "SUBMITTED", format: "CAROUSEL" });
    await set(ids.top, { plannedAt: new Date("2026-11-05T00:00:00+07:00"), status: "SUBMITTED" });
    // middle (10 Nov) sits below top (5 Nov) but is later: out of order.

    const mock1 = await mkMedia("mock1");
    const mock2 = await mkMedia("mock2");
    const final = await mkMedia("final");
    const video = await mkMedia("clip", "VIDEO");
    await db.prisma.contentPostMedia.createMany({ data: [
      { postId: ids.top, mediaId: mock1, role: "MOCKUP", order: 0 },
      { postId: ids.top, mediaId: final, role: "FINAL", order: 0 },
      { postId: ids.middle, mediaId: mock2, role: "MOCKUP", order: 1 },
      { postId: ids.middle, mediaId: video, role: "MOCKUP", order: 0 },
    ] });

    ids.pubOld = (await createPostWith(db.prisma, lead, { channelId: first, surface: "FEED", kind: "PUBLISHED", publishedAt: "2026-01-01" })).id;
    ids.pubNew = (await createPostWith(db.prisma, lead, { channelId: first, surface: "FEED", kind: "PUBLISHED", publishedAt: "2026-02-01" })).id;
    ids.reel = await planned(first, "REEL");
    await db.prisma.contentPostMedia.create({ data: { postId: ids.reel, mediaId: await mkMedia("reelimg"), role: "MOCKUP" } });

    const other = await planned(second);
    await set(other, { status: "SUBMITTED" });
  });
  afterAll(async () => { await db?.stop(); });

  it("lists channels in position order with SUBMITTED counts", async () => {
    const v = await loadContentPlan(db.prisma, lead, { tab: "feed" }, CLOUD);
    expect(v.channels.map((c) => c.handle)).toEqual(["first", "second"]);
    expect(v.channels.map((c) => c.awaiting)).toEqual([2, 1]);
    expect(v.channels[0]).toMatchObject({ brandName: "View Brand", displayName: "First" });
    expect(v.channels[0].avatarUrl).toBe("https://res.cloudinary.com/demo/image/upload/c_fill,w_64,h_64,f_auto,q_auto/clowork/x/content/avatar");
    expect(v.channels[1].avatarUrl).toBeNull();
  });

  it("defaults to the first channel and falls back on an unknown id", async () => {
    const a = await loadContentPlan(db.prisma, lead, { tab: "feed" }, CLOUD);
    const b = await loadContentPlan(db.prisma, lead, { channelId: "nope", tab: "feed" }, CLOUD);
    const c = await loadContentPlan(db.prisma, lead, { channelId: second, tab: "feed" }, CLOUD);
    expect(a.channel?.id).toBe(first);
    expect(b.channel?.id).toBe(first);
    expect(c.channel?.id).toBe(second);
    expect(a.channel).toMatchObject({ handle: "first", bio: "Hello", plannedCount: 4, awaiting: 2 });
  });

  it("orders planned by position and published by date, newest first", async () => {
    const v = await loadContentPlan(db.prisma, lead, { channelId: first, tab: "feed" }, CLOUD);
    expect(v.planned.map((t) => t.id)).toEqual([ids.top, ids.middle, ids.bottom]);
    expect(v.published.map((t) => t.id)).toEqual([ids.pubNew, ids.pubOld]);
    expect(v.planned[0].plannedAt).toBe("2026-11-05");
    expect(v.planned[1]).toMatchObject({ status: "SUBMITTED", format: "CAROUSEL" });
  });

  it("picks FINAL over MOCKUP, first MOCKUP by order, video as poster", async () => {
    const v = await loadContentPlan(db.prisma, lead, { channelId: first, tab: "feed" }, CLOUD);
    const cover = Object.fromEntries(v.planned.map((t) => [t.id, t.coverUrl]));
    expect(cover[ids.top]).toBe("https://res.cloudinary.com/demo/image/upload/c_fill,ar_3:4,w_360,f_auto,q_auto/clowork/x/content/final");
    expect(cover[ids.middle]).toBe("https://res.cloudinary.com/demo/video/upload/c_fill,ar_3:4,w_360,f_auto,q_auto/so_0/clowork/x/content/clip.jpg");
    expect(cover[ids.bottom]).toBeNull();
  });

  it("uses the tab's preset and surface", async () => {
    const v = await loadContentPlan(db.prisma, lead, { channelId: first, tab: "reels" }, CLOUD);
    expect(v.planned.map((t) => t.id)).toEqual([ids.reel]);
    expect(v.planned[0].coverUrl).toBe("https://res.cloudinary.com/demo/image/upload/c_fill,ar_9:16,w_360,f_auto,q_auto/clowork/x/content/reelimg");
    expect((await loadContentPlan(db.prisma, lead, { channelId: first, tab: "stories" }, CLOUD)).planned).toEqual([]);
  });

  it("flags out-of-order tiles", async () => {
    const v = await loadContentPlan(db.prisma, lead, { channelId: first, tab: "feed" }, CLOUD);
    expect(v.planned.filter((t) => t.warn).map((t) => t.id)).toEqual([ids.middle]);
    expect(v.published.every((t) => !t.warn)).toBe(true);
  });

  it("has no URLs when media storage is not configured", async () => {
    const v = await loadContentPlan(db.prisma, lead, { channelId: first, tab: "feed" }, null);
    expect(v.mediaReady).toBe(false);
    expect(v.channels[0].avatarUrl).toBeNull();
    expect(v.planned.every((t) => t.coverUrl === null)).toBe(true);
  });

  it("sets permissions from the user", async () => {
    const asLead = await loadContentPlan(db.prisma, lead, { tab: "feed" }, CLOUD);
    const asReq = await loadContentPlan(db.prisma, requester, { tab: "feed" }, CLOUD);
    expect(asLead.can).toEqual({ draft: true, approve: true, manageChannels: true });
    expect(asReq.can).toEqual({ draft: false, approve: false, manageChannels: false });
    expect(asLead.mediaReady).toBe(true);
  });
});
