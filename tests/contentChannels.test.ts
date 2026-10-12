import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { ContentError } from "@/lib/content/errors";
import { createChannelWith, updateChannelWith, moveChannelWith, deleteChannelWith } from "@/lib/content/channels";
import type { ContentActor } from "@/lib/content/permissions";

describe("content channels", () => {
  let db: TestDb;
  let lead: ContentActor;
  let creative: ContentActor;
  let brandId: string;
  beforeAll(async () => {
    db = await createTestDb();
    const l = await db.prisma.user.create({ data: { email: "lead@clogent.co.id", name: "Lead", fullName: "Lead", appRole: "LEAD" } });
    const c = await db.prisma.user.create({ data: { email: "cr@clogent.co.id", name: "Cr", fullName: "Cr", appRole: "CREATIVE" } });
    lead = { id: l.id, appRole: "LEAD", jobRole: l.jobRole };
    creative = { id: c.id, appRole: "CREATIVE", jobRole: c.jobRole };
    brandId = (await db.prisma.brand.create({ data: { name: "Chan Brand" } })).id;
  });
  afterAll(async () => { await db?.stop(); });

  const input = (handle: string) => ({ brandId, handle, displayName: "Brand X" });
  const code = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as ContentError; } };

  it("forbids a creative from creating a channel", async () => {
    const e = await code(createChannelWith(db.prisma, creative, input("nope")));
    expect(e?.code).toBe("FORBIDDEN");
  });

  it("normalises the handle (trim, strip @, lowercase)", async () => {
    const { id } = await createChannelWith(db.prisma, lead, input("@BrandX "));
    expect((await db.prisma.socialChannel.findUniqueOrThrow({ where: { id } })).handle).toBe("brandx");
  });

  it("rejects an invalid handle with a field error", async () => {
    const e = await code(createChannelWith(db.prisma, lead, input("bad handle!")));
    expect(e?.code).toBe("INVALID");
    expect(e?.fieldErrors?.handle).toBeTruthy();
  });

  it("rejects a duplicate handle with fieldErrors.handle", async () => {
    const e = await code(createChannelWith(db.prisma, lead, input("BRANDX")));
    expect(e?.code).toBe("INVALID");
    expect(e?.fieldErrors?.handle).toBeTruthy();
  });

  it("a brand from another workspace is NOT_FOUND", async () => {
    const ws = await db.raw.workspace.create({ data: { name: "Other", slug: "other-ws" } });
    const other = await db.raw.brand.create({ data: { name: "Foreign", workspaceId: ws.id } });
    const e = await code(createChannelWith(db.prisma, lead, { brandId: other.id, handle: "foreign", displayName: "F" }));
    expect(e?.code).toBe("NOT_FOUND");
  });

  it("an avatar from another workspace is NOT_FOUND", async () => {
    const ws = await db.raw.workspace.findUniqueOrThrow({ where: { slug: "other-ws" } });
    const m = await db.raw.media.create({
      data: { publicId: "clowork/x/avatar/a", type: "IMAGE", width: 1, height: 1, bytes: 1, uploadedById: lead.id, workspaceId: ws.id },
    });
    const e = await code(createChannelWith(db.prisma, lead, { ...input("withavatar"), avatarMediaId: m.id }));
    expect(e?.code).toBe("NOT_FOUND");
  });

  it("appends new channels at the end and moves them", async () => {
    const a = await createChannelWith(db.prisma, lead, input("order.a"));
    const b = await createChannelWith(db.prisma, lead, input("order.b"));
    const list = async () => (await db.prisma.socialChannel.findMany({ orderBy: { position: "desc" } })).map((c) => c.id);
    let ids = await list();
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id));
    expect(ids[ids.length - 1]).toBe(b.id);
    await moveChannelWith(db.prisma, lead, b.id, null, ids[0]); // to the very top
    ids = await list();
    expect(ids[0]).toBe(b.id);
  });

  it("renumbers when neighbours have no room left", async () => {
    const x = await createChannelWith(db.prisma, lead, input("tight.x"));
    const y = await createChannelWith(db.prisma, lead, input("tight.y"));
    const z = await createChannelWith(db.prisma, lead, input("tight.z"));
    await db.prisma.socialChannel.update({ where: { id: x.id }, data: { position: 100 } });
    await db.prisma.socialChannel.update({ where: { id: y.id }, data: { position: 100 } });
    await moveChannelWith(db.prisma, lead, z.id, x.id, y.id);
    const ids = (await db.prisma.socialChannel.findMany({ orderBy: { position: "desc" } })).map((c) => c.id);
    expect(ids.indexOf(x.id)).toBeLessThan(ids.indexOf(z.id));
    expect(ids.indexOf(z.id)).toBeLessThan(ids.indexOf(y.id));
  });

  it("updates a channel and allows keeping its own handle", async () => {
    const { id } = await createChannelWith(db.prisma, lead, input("upd"));
    await updateChannelWith(db.prisma, lead, id, { ...input("@UPD"), displayName: "Renamed", bio: " hi " });
    const row = await db.prisma.socialChannel.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ handle: "upd", displayName: "Renamed", bio: "hi" });
  });

  it("blocks delete when a post is APPROVED, allows it otherwise", async () => {
    const { id } = await createChannelWith(db.prisma, lead, input("del.a"));
    await db.prisma.contentPost.create({ data: { channelId: id, surface: "FEED", position: 0, status: "APPROVED", authorId: lead.id } });
    expect((await code(deleteChannelWith(db.prisma, lead, id)))?.code).toBe("INVALID");
    const free = await createChannelWith(db.prisma, lead, input("del.b"));
    await db.prisma.contentPost.create({ data: { channelId: free.id, surface: "FEED", position: 0, status: "DRAFT", authorId: lead.id } });
    await deleteChannelWith(db.prisma, lead, free.id);
    expect(await db.prisma.socialChannel.findFirst({ where: { id: free.id } })).toBeNull();
  });
});
