import { describe, it, expect, vi, beforeEach } from "vitest";

const redirect = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
const authFn = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authFn() }));
const findUnique = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) }, allowedEmail: { findFirst: (...a: unknown[]) => findFirst(...a) } }, scopedDb: (w: string) => ({ scopedTo: w }) }));

import { requireUserOrRedirect, requireUser, requireUserForPasswordChange, requireScope, dbFor } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import { UnauthenticatedError } from "@/lib/session-core";

const row = { id: "u1", active: true, email: "fadli@clogent.co.id", appRole: "CREATIVE", jobRole: "DESIGNER", passwordVersion: 0, workspaceId: "clogent", mustChangePassword: false };
beforeEach(() => { redirect.mockClear(); authFn.mockReset(); findUnique.mockReset(); findFirst.mockReset(); });

describe("requireUserOrRedirect", () => {
  it("redirects to /signin when there is no session", async () => {
    authFn.mockResolvedValue(null);
    await expect(requireUserOrRedirect()).rejects.toThrow("NEXT_REDIRECT:/signin");
    expect(redirect).toHaveBeenCalledWith("/signin");
  });
  it("redirects for an inactive user", async () => {
    authFn.mockResolvedValue({ user: { id: "u1", loginEmail: "fadli@clogent.co.id" } });
    findUnique.mockResolvedValue({ ...row, active: false });
    await expect(requireUserOrRedirect()).rejects.toThrow("NEXT_REDIRECT:/signin");
  });
  it("redirects when the loginEmail claim no longer matches the user's email", async () => {
    authFn.mockResolvedValue({ user: { id: "u1", loginEmail: "old@clogent.co.id" } });
    findUnique.mockResolvedValue(row);
    await expect(requireUserOrRedirect()).rejects.toThrow("NEXT_REDIRECT:/signin");
  });
  it("returns the user when the session is valid", async () => {
    authFn.mockResolvedValue({ user: { id: "u1", loginEmail: "fadli@clogent.co.id" } });
    findUnique.mockResolvedValue(row);
    expect(await requireUserOrRedirect()).toEqual({ id: "u1", appRole: "CREATIVE", jobRole: "DESIGNER", workspaceId: "clogent", mustChangePassword: false });
    expect(redirect).not.toHaveBeenCalled();
  });
  it("redirects to /change-password when the password change is required", async () => {
    authFn.mockResolvedValue({ user: { id: "u1", loginEmail: "fadli@clogent.co.id" } });
    findUnique.mockResolvedValue({ ...row, mustChangePassword: true });
    await expect(requireUserOrRedirect()).rejects.toThrow("NEXT_REDIRECT:/change-password");
  });
  it("does not turn unrelated errors into a redirect", async () => {
    authFn.mockRejectedValue(new Error("db down"));
    await expect(requireUserOrRedirect()).rejects.toThrow("db down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("withUser", () => {
  it("returns the UNAUTHENTICATED result object instead of throwing", async () => {
    const fn = vi.fn();
    const r = await withUser(async () => { throw new UnauthenticatedError(); }, fn);
    expect(r).toEqual(unauthResult());
    expect(r).toEqual({ ok: false, code: "UNAUTHENTICATED", message: "Your session ended. Sign in again." });
    expect(fn).not.toHaveBeenCalled();
  });
  it("accepts the legacy Error('Unauthenticated') and a custom mapper", async () => {
    const r = await withUser(async () => { throw new Error("Unauthenticated"); }, async () => 1, () => ({ ok: false as const, custom: true }));
    expect(r).toEqual({ ok: false, custom: true });
  });
  it("runs fn for a valid user and lets fn's own errors through", async () => {
    const u = { id: "u", name: "U", appRole: "ADMIN" as const, jobRole: "OTHER" as const, workspaceId: "clogent", mustChangePassword: false };
    expect(await withUser(async () => u, async (x) => x.id)).toBe("u");
    await expect(withUser(async () => u, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });
  it("lets non-auth errors from getUser through", async () => {
    await expect(withUser(async () => { throw new Error("db down"); }, async () => 1)).rejects.toThrow("db down");
  });
});

describe("password-change flag", () => {
  const flagged = () => {
    authFn.mockResolvedValue({ user: { id: "u1", loginEmail: "fadli@clogent.co.id" } });
    findUnique.mockResolvedValue({ ...row, mustChangePassword: true });
  };
  it("requireUserForPasswordChange returns the flagged user", async () => {
    flagged();
    expect(await requireUserForPasswordChange()).toMatchObject({ id: "u1", mustChangePassword: true, workspaceId: "clogent" });
  });
  it("withUser(requireUser, ...) returns the unauth result for a flagged user", async () => {
    flagged();
    const fn = vi.fn();
    expect(await withUser(requireUser, fn)).toEqual(unauthResult());
    expect(fn).not.toHaveBeenCalled();
  });
  it("requireScope redirects a flagged user and scopes the db for others", async () => {
    flagged();
    await expect(requireScope()).rejects.toThrow("NEXT_REDIRECT:/change-password");
  });
  it("dbFor scopes to the user's workspace", () => {
    expect(dbFor({ id: "u", name: "U", appRole: "ADMIN", jobRole: "OTHER", workspaceId: "w2", mustChangePassword: false })).toEqual({ scopedTo: "w2" });
  });
});
