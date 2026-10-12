import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { createTestDb, type TestDb } from "./helpers/testDb";
import { cloudinaryConfig } from "@/lib/media/config";
import { mediaUrl } from "@/lib/media/url";
import { signUpload } from "@/lib/media/sign";
import { cloudinaryClient, type CloudinaryClient, type CloudinaryResource } from "@/lib/media/client";
import { registerMediaWith, MediaError } from "@/lib/media/register";
import { destroyMediaWith } from "@/lib/media/destroy";

const CFG = { cloudName: "demo", apiKey: "key123", apiSecret: "s3cret" };

describe("cloudinaryConfig", () => {
  it("needs all three variables", () => {
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s" })).toEqual({ cloudName: "c", apiKey: "k", apiSecret: "s" });
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k" })).toBeNull();
  });
});

describe("mediaUrl", () => {
  it("builds preset urls", () => {
    expect(mediaUrl({ publicId: "clowork/w/content/abc", type: "IMAGE" }, "grid-3x4", "demo"))
      .toBe("https://res.cloudinary.com/demo/image/upload/c_fill,ar_3:4,w_360,f_auto,q_auto/clowork/w/content/abc");
    expect(mediaUrl({ publicId: "clowork/w/content/vid", type: "VIDEO" }, "poster", "demo"))
      .toBe("https://res.cloudinary.com/demo/video/upload/c_fill,ar_3:4,w_360,f_auto,q_auto/so_0/clowork/w/content/vid.jpg");
    expect(mediaUrl({ publicId: "p", type: "VIDEO" }, "reel-9x16", "demo"))
      .toBe("https://res.cloudinary.com/demo/video/upload/c_fill,ar_9:16,w_360,f_auto,q_auto/p");
  });
});

describe("signUpload", () => {
  const NOW = 1_700_000_000_000;
  it("signs the sorted params with the secret appended (image)", () => {
    const r = signUpload(CFG, "ws1", "content", "image", NOW);
    expect(r.folder).toBe("clowork/ws1/content");
    expect(r.params.asset_folder).toBe("clowork/ws1/content");
    expect(r.params.folder).toBeUndefined();
    expect(r.publicId).toMatch(/^clowork\/ws1\/content\/[A-Za-z0-9_-]+$/);
    expect(r.params.public_id).toBe(r.publicId);
    expect(r.timestamp).toBe(1_700_000_000);
    expect(r.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    const literal = `allowed_formats=jpg,png,webp,heic,mp4,mov&asset_folder=clowork/ws1/content&public_id=${r.publicId}&timestamp=1700000000s3cret`;
    expect(r.signature).toBe(createHash("sha1").update(literal).digest("hex"));
    expect(r.params).toMatchObject({ api_key: "key123", signature: r.signature, timestamp: "1700000000" });
  });
  it("adds the incoming transformation for video", () => {
    const r = signUpload(CFG, "ws1", "content", "video", NOW);
    expect(r.params.transformation).toBe("c_limit,w_1280,h_1280,q_auto");
    expect(r.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo/video/upload");
    const literal = `allowed_formats=jpg,png,webp,heic,mp4,mov&asset_folder=clowork/ws1/content&public_id=${r.publicId}&timestamp=1700000000&transformation=c_limit,w_1280,h_1280,q_auto` + "s3cret";
    expect(r.signature).toBe(createHash("sha1").update(literal).digest("hex"));
  });
  it("gives each upload a fresh id", () => {
    expect(signUpload(CFG, "ws1", "avatar", "image").publicId).not.toBe(signUpload(CFG, "ws1", "avatar", "image").publicId);
  });
});

describe("cloudinaryClient", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("looks up a resource with basic auth, encoding segments but keeping slashes; 404 is null", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ bytes: 5, width: 2, height: 3, format: "png", extra: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const c = cloudinaryClient(CFG);
    expect(await c.getResource("clowork/w/content/a b", "IMAGE")).toEqual({ bytes: 5, width: 2, height: 3, duration: undefined, format: "png" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/resources/image/upload/clowork/w/content/a%20b");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("key123:s3cret").toString("base64")}`);
    expect(await c.getResource("x", "VIDEO")).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toContain("/resources/video/upload/x");
    await expect(c.getResource("x", "IMAGE")).rejects.toThrow();
  });
  it("destroys with a signed form body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await cloudinaryClient(CFG).destroy("clowork/w/content/a", "VIDEO");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.cloudinary.com/v1_1/demo/video/destroy");
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("public_id")).toBe("clowork/w/content/a");
    expect(body.get("api_key")).toBe("key123");
    const expected = createHash("sha1").update(`public_id=clowork/w/content/a&timestamp=${body.get("timestamp")}s3cret`).digest("hex");
    expect(body.get("signature")).toBe(expected);
  });
});

describe("media registration", () => {
  let db: TestDb;
  let user: { id: string; workspaceId: string };
  beforeAll(async () => {
    db = await createTestDb();
    const u = await db.prisma.user.create({ data: { email: "m@clogent.co.id", name: "M", fullName: "M", appRole: "CREATIVE" } });
    user = { id: u.id, workspaceId: db.workspaceId };
  });
  afterAll(async () => { await db?.stop(); });

  const fake = (res: CloudinaryResource | null, destroy: CloudinaryClient["destroy"] = async () => {}): CloudinaryClient => ({
    getResource: async () => res, destroy,
  });
  const pid = (s = "a") => `clowork/${db.workspaceId}/content/${s}`;
  const code = (p: Promise<unknown>) => p.then(() => null, (e) => (e instanceof MediaError ? e.code : e));

  it("rejects a public_id outside the user's workspace folder without calling Cloudinary", async () => {
    const getResource = vi.fn();
    const c = { getResource, destroy: vi.fn() } as CloudinaryClient;
    expect(await code(registerMediaWith(db.prisma, c, user, { publicId: "clowork/other/content/a", type: "IMAGE" }))).toBe("INVALID");
    expect(await code(registerMediaWith(db.prisma, c, user, { publicId: `clowork/${db.workspaceId}x/a`, type: "IMAGE" }))).toBe("INVALID");
    expect(getResource).not.toHaveBeenCalled();
  });
  it("NOT_FOUND when Cloudinary has no such resource", async () => {
    expect(await code(registerMediaWith(db.prisma, fake(null), user, { publicId: pid(), type: "IMAGE" }))).toBe("NOT_FOUND");
  });
  it("rejects unsupported formats and a type mismatch", async () => {
    expect(await code(registerMediaWith(db.prisma, fake({ bytes: 1, width: 1, height: 1, format: "gif" }), user, { publicId: pid(), type: "IMAGE" }))).toBe("INVALID");
    expect(await code(registerMediaWith(db.prisma, fake({ bytes: 1, width: 1, height: 1, format: "mp4", duration: 5 }), user, { publicId: pid(), type: "IMAGE" }))).toBe("INVALID");
    expect(await code(registerMediaWith(db.prisma, fake({ bytes: 1, width: 1, height: 1, format: "jpg" }), user, { publicId: pid(), type: "VIDEO" }))).toBe("INVALID");
  });
  it("enforces size and duration limits from Cloudinary's numbers", async () => {
    expect(await code(registerMediaWith(db.prisma, fake({ bytes: 10 * 1024 * 1024 + 1, width: 1, height: 1, format: "jpg" }), user, { publicId: pid(), type: "IMAGE" }))).toBe("TOO_LARGE");
    expect(await code(registerMediaWith(db.prisma, fake({ bytes: 1, width: 1, height: 1, format: "mp4", duration: 91 }), user, { publicId: pid(), type: "VIDEO" }))).toBe("TOO_LARGE");
    expect(await code(registerMediaWith(db.prisma, fake({ bytes: 100 * 1024 * 1024 + 1, width: 1, height: 1, format: "mp4", duration: 5 }), user, { publicId: pid(), type: "VIDEO" }))).toBe("TOO_LARGE");
  });
  it("stores dimensions, bytes and duration from Cloudinary and stamps the workspace", async () => {
    const img = await registerMediaWith(db.prisma, fake({ bytes: 1234, width: 800, height: 600, format: "png" }), user, { publicId: pid("img"), type: "IMAGE" });
    expect(img).toMatchObject({ width: 800, height: 600, bytes: 1234, durationSec: null, type: "IMAGE", uploadedById: user.id, workspaceId: db.workspaceId });
    const vid = await registerMediaWith(db.prisma, fake({ bytes: 9, width: 720, height: 1280, format: "mov", duration: 12.5 }), user, { publicId: pid("vid"), type: "VIDEO" });
    expect(vid).toMatchObject({ width: 720, height: 1280, durationSec: 12.5, type: "VIDEO" });
  });
  it("destroyMediaWith deletes the row even when Cloudinary fails", async () => {
    const m = await registerMediaWith(db.prisma, fake({ bytes: 1, width: 1, height: 1, format: "jpg" }), user, { publicId: pid("gone"), type: "IMAGE" });
    const destroy = vi.fn().mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await destroyMediaWith(db.prisma, fake(null, destroy), m.id);
    spy.mockRestore();
    expect(destroy).toHaveBeenCalledWith(pid("gone"), "IMAGE");
    expect(await db.raw.media.findUnique({ where: { id: m.id } })).toBeNull();
  });
});
