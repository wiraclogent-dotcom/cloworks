import { describe, it, expect, vi, beforeEach } from "vitest";

const me = { id: "u1", name: "Rina", appRole: "CREATIVE", jobRole: "DESIGNER", workspaceId: "ws1", mustChangePassword: false };
const db = vi.hoisted(() => ({ user: { findUnique: vi.fn(), update: vi.fn() } }));
const media = vi.hoisted(() => ({ register: vi.fn(), destroy: vi.fn() }));

vi.mock("@/lib/session", () => ({ requireUser: async () => me, dbFor: () => db }));
vi.mock("@/lib/media/config", () => ({ cloudinaryConfig: () => ({ cloudName: "demo", apiKey: "k", apiSecret: "s" }) }));
vi.mock("@/lib/media/client", () => ({ cloudinaryClient: () => ({}) }));
vi.mock("@/lib/media/register", () => ({
  MediaError: class MediaError extends Error { constructor(public code: string, m: string) { super(m); } },
  registerMediaWith: (...a: unknown[]) => media.register(...a),
}));
vi.mock("@/lib/media/destroy", () => ({ destroyMediaWith: (...a: unknown[]) => media.destroy(...a) }));

import { registerBoardUpload, removeBoardPicture, saveBoardBackground } from "@/app/(app)/requests/backgroundActions";

beforeEach(() => {
  vi.clearAllMocks();
  media.destroy.mockResolvedValue(undefined);
});

describe("board background actions", () => {
  it("saves a preset with a clamped veil, only for the signed-in person", async () => {
    expect(await saveBoardBackground({ id: "ocean", veil: 250 })).toEqual({ ok: true });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { boardBackground: "ocean", boardVeil: 100 } });
  });

  it("refuses an unknown background, and 'custom' without an uploaded picture", async () => {
    expect(await saveBoardBackground({ id: "../evil", veil: 0 })).toMatchObject({ ok: false, code: "INVALID" });
    db.user.findUnique.mockResolvedValue({ boardBackgroundMediaId: null });
    expect(await saveBoardBackground({ id: "custom", veil: 0 })).toMatchObject({ ok: false, code: "INVALID" });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("only registers pictures from this workspace's board folder (the replaced one is deleted)", async () => {
    expect(await registerBoardUpload("clowork/ws1/content/abc")).toMatchObject({ ok: false, code: "INVALID" });
    expect(await registerBoardUpload("clowork/other/board/abc")).toMatchObject({ ok: false, code: "INVALID" });
    expect(media.register).not.toHaveBeenCalled();
  });

  it("a new picture becomes the background and the old one is removed", async () => {
    media.register.mockResolvedValue({ id: "m2", publicId: "clowork/ws1/board/new", type: "IMAGE" });
    db.user.findUnique.mockResolvedValue({ boardBackgroundMediaId: "m1" });
    const r = await registerBoardUpload("clowork/ws1/board/new");
    expect(r).toEqual({ ok: true, src: "https://res.cloudinary.com/demo/image/upload/c_limit,w_2048,f_auto,q_auto/clowork/ws1/board/new" });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { boardBackground: "custom", boardBackgroundMediaId: "m2", boardVeil: 0 } });
    expect(media.destroy).toHaveBeenCalledWith(db, {}, "m1");
  });

  it("removing the picture goes back to the default preset", async () => {
    db.user.findUnique.mockResolvedValue({ boardBackgroundMediaId: "m1" });
    expect(await removeBoardPicture()).toEqual({ ok: true });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { boardBackground: "gradient", boardBackgroundMediaId: null, boardVeil: null } });
    expect(media.destroy).toHaveBeenCalledWith(db, {}, "m1");
  });
});
