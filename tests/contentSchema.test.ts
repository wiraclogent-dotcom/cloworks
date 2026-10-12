import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";

describe("content plan schema", () => {
  let db: TestDb;
  let userId: string;
  let channelId: string;
  beforeAll(async () => {
    db = await createTestDb();
    userId = (await db.prisma.user.create({ data: { email: "c@clogent.co.id", name: "C", fullName: "C", appRole: "ADMIN" } })).id;
    const brand = await db.prisma.brand.create({ data: { name: "Content Brand" } });
    channelId = (await db.prisma.socialChannel.create({
      data: { brandId: brand.id, platform: "INSTAGRAM", handle: "clogent", displayName: "Clogent" },
    })).id;
  });
  afterAll(async () => { await db?.stop(); });

  const media = (publicId: string) => db.prisma.media.create({
    data: { publicId, type: "IMAGE", width: 1, height: 1, bytes: 1, uploadedById: userId },
  });
  const post = (requestId?: string) => db.prisma.contentPost.create({
    data: { channelId, surface: "FEED", position: 1, authorId: userId, requestId },
  });
  const request = async () => {
    const div = await db.prisma.division.create({ data: { name: `D${Math.random()}` } });
    const type = await db.prisma.requestType.create({ data: { name: `T${Math.random()}` } });
    const brand = await db.prisma.brand.findFirstOrThrow();
    return db.prisma.request.create({
      data: { title: "R", brandId: brand.id, divisionId: div.id, typeId: type.id, requesterId: userId },
    });
  };

  it("stamps the workspace on channel, post, media", async () => {
    const ch = await db.prisma.socialChannel.findUniqueOrThrow({ where: { id: channelId } });
    const p = await post();
    const m = await media("clowork/x/content/a");
    expect([ch.workspaceId, p.workspaceId, m.workspaceId]).toEqual([db.workspaceId, db.workspaceId, db.workspaceId]);
  });

  it("allows only one post per request", async () => {
    const r = await request();
    await post(r.id);
    await expect(post(r.id)).rejects.toMatchObject({ code: "P2002" });
  });

  it("clears requestId when the request is deleted", async () => {
    const r = await request();
    const p = await post(r.id);
    await db.raw.request.delete({ where: { id: r.id } });
    const after = await db.prisma.contentPost.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.requestId).toBeNull();
  });

  it("deletes post media links and comments with the post", async () => {
    const p = await post();
    const m = await media("clowork/x/content/b");
    await db.prisma.contentPostMedia.create({ data: { postId: p.id, mediaId: m.id } });
    await db.prisma.contentComment.create({ data: { postId: p.id, authorId: userId, body: "hi" } });
    await db.prisma.contentPost.delete({ where: { id: p.id } });
    expect(await db.prisma.contentPostMedia.count({ where: { postId: p.id } })).toBe(0);
    expect(await db.prisma.contentComment.count({ where: { postId: p.id } })).toBe(0);
  });
});
