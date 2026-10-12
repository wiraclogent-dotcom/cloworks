import { describe, it, expect, vi, beforeEach } from "vitest";

const admin = { id: "a", appRole: "ADMIN" as const, jobRole: "OTHER" as const, workspaceId: "clogent", mustChangePassword: false };
const scoped = { scoped: true };
const session = vi.hoisted(() => ({ unauth: false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", async () => {
  const { UnauthenticatedError } = await vi.importActual<typeof import("@/lib/session-core")>("@/lib/session-core");
  return {
    requireUser: async () => { if (session.unauth) throw new UnauthenticatedError(); return admin; },
    dbFor: () => scoped,
  };
});
const lib = vi.hoisted(() => ({ createInvite: vi.fn(), approveFor: vi.fn(), mergePreview: vi.fn(), mergeUsers: vi.fn() }));
vi.mock("@/lib/invites", async (orig) => ({ ...(await orig<typeof import("@/lib/invites")>()), createInvite: lib.createInvite }));
vi.mock("@/lib/joinDeps", async (orig) => ({ ...(await orig<typeof import("@/lib/joinDeps")>()), approveFor: lib.approveFor, requestBaseUrl: async () => "https://app.test" }));
vi.mock("@/lib/mergeUsers", () => ({ mergePreview: lib.mergePreview, mergeUsers: lib.mergeUsers }));
vi.mock("@/lib/mailer", () => ({ createMailerFromEnv: () => ({ send: vi.fn() }) }));

import { inviteMember, approveRequest, previewMerge, mergePerson } from "@/app/(app)/admin/users/actions";
import { revalidatePath } from "next/cache";
import { AdminError } from "@/lib/admin";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
beforeEach(() => { vi.clearAllMocks(); session.unauth = false; });

describe("inviteMember", () => {
  it("passes an optional userId; empty means none", async () => {
    lib.createInvite.mockResolvedValue(undefined);
    await inviteMember(null, fd({ email: "a@x.co", appRole: "REQUESTER", jobRole: "OTHER", userId: "u9" }));
    expect(lib.createInvite).toHaveBeenLastCalledWith(scoped, admin, expect.anything(), { email: "a@x.co", appRole: "REQUESTER", jobRole: "OTHER", userId: "u9" }, "https://app.test");
    await inviteMember(null, fd({ email: "a@x.co", appRole: "REQUESTER", jobRole: "OTHER", userId: "" }));
    expect(lib.createInvite.mock.calls[1][3].userId).toBeUndefined();
  });
});

describe("approveRequest", () => {
  const base = { applicantId: "ap1", appRole: "REQUESTER", jobRole: "OTHER" };
  it("passes linkUserId and uses the person's name in the success copy", async () => {
    lib.approveFor.mockResolvedValue({ userId: "u9", linked: true, name: "Sari" });
    const r = await approveRequest(null, fd({ ...base, linkUserId: "u9" }));
    expect(lib.approveFor).toHaveBeenCalledWith(admin, expect.anything(), "ap1", { appRole: "REQUESTER", jobRole: "OTHER" }, "https://app.test", "u9");
    expect(r).toMatchObject({ ok: true, message: "Approved as Sari. They sign in once more to continue." });
  });
  it("empty linkUserId is none and keeps the plain copy", async () => {
    lib.approveFor.mockResolvedValue({ userId: "ap1", linked: false, name: "Andi" });
    const r = await approveRequest(null, fd({ ...base, linkUserId: "" }));
    expect(lib.approveFor.mock.calls[0][5]).toBeUndefined();
    expect(r).toMatchObject({ ok: true, message: "Approved. They can sign in now." });
  });
});

describe("previewMerge", () => {
  it("returns the preview", async () => {
    const preview = { from: { id: "f" }, into: { id: "i" }, counts: {}, movesLogin: false };
    lib.mergePreview.mockResolvedValue(preview);
    expect(await previewMerge(null, fd({ fromId: "f", intoId: "i" }))).toEqual({ ok: true, preview });
    expect(lib.mergePreview).toHaveBeenCalledWith(scoped, admin, "f", "i");
  });
  it("maps AdminError to an error state", async () => {
    lib.mergePreview.mockRejectedValue(new AdminError("CONFLICT", "Both people have a login. Clear one login email first."));
    expect(await previewMerge(null, fd({ fromId: "f", intoId: "i" }))).toEqual({ ok: false, error: "Both people have a login. Clear one login email first." });
  });
  it("unauthenticated gets an error state", async () => {
    session.unauth = true;
    expect(await previewMerge(null, fd({ fromId: "f", intoId: "i" }))).toMatchObject({ ok: false, error: expect.stringContaining("session ended") });
    expect(lib.mergePreview).not.toHaveBeenCalled();
  });
});

describe("mergePerson", () => {
  it("merges, reports the survivor and revalidates", async () => {
    lib.mergeUsers.mockResolvedValue({ intoId: "i", intoName: "Sari" });
    const r = await mergePerson(null, fd({ fromId: "f", intoId: "i" }));
    expect(lib.mergeUsers).toHaveBeenCalledWith(scoped, admin, "f", "i");
    expect(r).toMatchObject({ ok: true, message: "Merged into Sari." });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
  });
  it("shows an AdminError as a failure and does not revalidate", async () => {
    lib.mergeUsers.mockRejectedValue(new AdminError("CONFLICT", "nope"));
    expect(await mergePerson(null, fd({ fromId: "f", intoId: "i" }))).toMatchObject({ ok: false, code: "CONFLICT", message: "nope" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("unauthenticated gets the unauth result", async () => {
    session.unauth = true;
    expect(await mergePerson(null, fd({ fromId: "f", intoId: "i" }))).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(lib.mergeUsers).not.toHaveBeenCalled();
  });
});
