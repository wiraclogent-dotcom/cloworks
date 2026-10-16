import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MAX_PHOTO_BYTES, PhotoError, loadProfilePhoto, removeProfilePhoto, setProfilePhoto, sniffPhotoType } from "@/lib/profilePhoto";
import { makeScoped } from "@/lib/db";
import { createTestDb, type TestDb } from "./helpers/testDb";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBP"), 0, 0]);
const SVG = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");

let db: TestDb;
let userId: string;

beforeAll(async () => {
  db = await createTestDb();
  const u = await db.raw.user.create({
    data: { workspaceId: db.workspaceId, name: "Photo", fullName: "Photo Person", email: "photo@clogent.co.id", appRole: "REQUESTER", jobRole: "OTHER" },
  });
  userId = u.id;
});
afterAll(async () => {
  await db?.stop();
});

describe("sniffPhotoType", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(sniffPhotoType(JPEG)).toBe("image/jpeg");
    expect(sniffPhotoType(PNG)).toBe("image/png");
    expect(sniffPhotoType(WEBP)).toBe("image/webp");
  });
  it("refuses SVG, text and short or empty input", () => {
    expect(sniffPhotoType(SVG)).toBeNull();
    expect(sniffPhotoType(new Uint8Array())).toBeNull();
    expect(sniffPhotoType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("setProfilePhoto / loadProfilePhoto / removeProfilePhoto", () => {
  it("stores a photo on the person's row and loads it back with its type", async () => {
    await setProfilePhoto(db.prisma, userId, JPEG);
    const p = await loadProfilePhoto(db.prisma, userId);
    expect(p?.type).toBe("image/jpeg");
    expect(Array.from(p!.bytes)).toEqual(Array.from(JPEG));
  });
  it("replacing the photo moves its version forward", async () => {
    const before = (await db.raw.user.findUniqueOrThrow({ where: { id: userId } })).avatarUpdatedAt!;
    await setProfilePhoto(db.prisma, userId, PNG, new Date(before.getTime() + 60_000));
    const after = (await db.raw.user.findUniqueOrThrow({ where: { id: userId } })).avatarUpdatedAt!;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
    expect((await loadProfilePhoto(db.prisma, userId))?.type).toBe("image/png");
  });
  it("refuses an oversized picture and leaves the stored one alone", async () => {
    const big = new Uint8Array(MAX_PHOTO_BYTES + 1);
    big.set(JPEG, 0);
    await expect(setProfilePhoto(db.prisma, userId, big)).rejects.toBeInstanceOf(PhotoError);
    expect((await loadProfilePhoto(db.prisma, userId))?.type).toBe("image/png");
  });
  it("refuses SVG and empty files", async () => {
    await expect(setProfilePhoto(db.prisma, userId, SVG)).rejects.toThrow(/JPEG, PNG or WebP/);
    await expect(setProfilePhoto(db.prisma, userId, new Uint8Array())).rejects.toThrow(/Choose a picture/);
  });
  it("removing the photo goes back to initials", async () => {
    await removeProfilePhoto(db.prisma, userId);
    expect(await loadProfilePhoto(db.prisma, userId)).toBeNull();
    const u = await db.raw.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.avatar).toBeNull();
    expect(u.avatarUpdatedAt).toBeNull();
  });
  it("a photo is only visible inside its own workspace", async () => {
    await setProfilePhoto(db.prisma, userId, JPEG);
    const other = makeScoped(db.raw, "other");
    expect(await loadProfilePhoto(other, userId)).toBeNull();
  });
});
