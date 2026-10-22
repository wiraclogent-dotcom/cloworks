import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnauthenticatedError } from "@/lib/session-core";
import { MarketingError } from "@/lib/marketing/errors";

let signedIn = true;
const viewer = { id: "u1", name: "Wira", appRole: "ADMIN", jobRole: "OTHER", workspaceId: "w", mustChangePassword: false };
const revalidatePath = vi.fn();
const saveActivityWith = vi.fn();
const deleteActivityWith = vi.fn();
const saveProductFocusWith = vi.fn();
const saveAnnouncementWith = vi.fn();
const deleteAnnouncementWith = vi.fn();

vi.mock("@/lib/session", () => ({
  requireUser: async () => { if (!signedIn) throw new UnauthenticatedError(); return viewer; },
  dbFor: () => ({ scoped: true }),
}));
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
vi.mock("@/lib/marketing/activities", () => ({ saveActivityWith: (...a: unknown[]) => saveActivityWith(...a), deleteActivityWith: (...a: unknown[]) => deleteActivityWith(...a) }));
vi.mock("@/lib/marketing/month", () => ({
  saveProductFocusWith: (...a: unknown[]) => saveProductFocusWith(...a),
  saveAnnouncementWith: (...a: unknown[]) => saveAnnouncementWith(...a),
  deleteAnnouncementWith: (...a: unknown[]) => deleteAnnouncementWith(...a),
}));

import { deleteActivity, deleteAnnouncement, saveActivity, saveAnnouncement, saveProductFocus } from "@/app/(app)/marketing/actions";

const input = { title: "Payday flight", divisionId: "ads", startDay: "2026-10-24", endDay: "2026-10-31", status: "CONFIRMED" };

beforeEach(() => { signedIn = true; vi.clearAllMocks(); });

describe("marketing actions", () => {
  it("return a result object when the session ended", async () => {
    signedIn = false;
    const unauth = { ok: false, code: "UNAUTHENTICATED", message: "Your session ended. Sign in again." };
    expect(await saveActivity(null, input)).toEqual(unauth);
    expect(await deleteActivity("a")).toEqual(unauth);
    expect(await saveProductFocus("2026-10", "x")).toEqual(unauth);
    expect(await saveAnnouncement(null, { month: "2026-10", body: "x" })).toEqual(unauth);
    expect(await deleteAnnouncement("n")).toEqual(unauth);
    expect(saveActivityWith).not.toHaveBeenCalled();
  });

  it("pass the scoped db and the viewer, return the id and revalidate", async () => {
    saveActivityWith.mockResolvedValue({ id: "a1" });
    expect(await saveActivity(null, input)).toEqual({ ok: true, id: "a1" });
    expect(saveActivityWith).toHaveBeenCalledWith({ scoped: true }, viewer, null, input);
    expect(revalidatePath).toHaveBeenCalledWith("/marketing");
  });

  it("turn a forbidden error into a result", async () => {
    deleteActivityWith.mockRejectedValue(new MarketingError("FORBIDDEN", "You can only edit activities of divisions you lead."));
    expect(await deleteActivity("a1")).toEqual({ ok: false, code: "FORBIDDEN", message: "You can only edit activities of divisions you lead." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("keep field errors", async () => {
    saveProductFocusWith.mockRejectedValue(new MarketingError("INVALID", "Check the highlighted fields.", { productFocus: "Too long" }));
    expect(await saveProductFocus("2026-10", "x")).toEqual({ ok: false, code: "INVALID", message: "Check the highlighted fields.", fieldErrors: { productFocus: "Too long" } });
  });

  it("rethrow anything that is not a marketing error", async () => {
    saveAnnouncementWith.mockRejectedValue(new Error("db down"));
    await expect(saveAnnouncement(null, { month: "2026-10", body: "x" })).rejects.toThrow("db down");
  });

  it("delete an announcement", async () => {
    deleteAnnouncementWith.mockResolvedValue(undefined);
    expect(await deleteAnnouncement("n1")).toEqual({ ok: true });
    expect(deleteAnnouncementWith).toHaveBeenCalledWith({ scoped: true }, viewer, "n1");
  });
});
