// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const redirect = vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); });
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
const requireUserForPasswordChange = vi.fn();
const changeOwnPassword = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/session", () => ({
  requireUserForPasswordChange: () => requireUserForPasswordChange(),
  dbFor: () => ({ scoped: true }),
}));
vi.mock("@/lib/auth", () => ({ signOut: (...a: unknown[]) => signOut(...a) }));
vi.mock("@/lib/admin", async (orig) => ({ ...(await orig<typeof import("@/lib/admin")>()), changeOwnPassword: (...a: unknown[]) => changeOwnPassword(...a) }));

import ChangePasswordPage from "@/app/change-password/page";
import { changePasswordFirstTime } from "@/app/change-password/actions";

const me = { id: "u1", appRole: "CREATIVE", jobRole: "DESIGNER", workspaceId: "clogent", mustChangePassword: true };
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
beforeEach(() => { vi.clearAllMocks(); requireUserForPasswordChange.mockResolvedValue(me); });
afterEach(cleanup);

describe("/change-password page", () => {
  it("renders the three password fields, the intro and a Sign out button", async () => {
    render(await ChangePasswordPage());
    expect(screen.getByLabelText("Temporary password")).toBeTruthy();
    expect(screen.getByLabelText("New password (at least 10 characters)")).toBeTruthy();
    expect(screen.getByLabelText("Confirm new password")).toBeTruthy();
    expect(screen.getByText("Choose your own password before you continue. The one you were given is temporary.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
  it("sends a visitor without a session to /signin", async () => {
    const { UnauthenticatedError } = await import("@/lib/session-core");
    requireUserForPasswordChange.mockRejectedValue(new UnauthenticatedError());
    await expect(ChangePasswordPage()).rejects.toThrow("NEXT_REDIRECT:/signin");
  });
});

describe("changePasswordFirstTime action", () => {
  it("changes the password then signs out to /signin?changed=1", async () => {
    changeOwnPassword.mockResolvedValue(undefined);
    const r = await changePasswordFirstTime(null, fd({ currentPassword: "temp-pass-123", newPassword: "my-own-password-1", confirmPassword: "my-own-password-1" }));
    expect(changeOwnPassword).toHaveBeenCalledWith({ scoped: true }, "u1", "temp-pass-123", "my-own-password-1");
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/signin?changed=1" });
    expect(r?.values).toEqual({});
  });
  it("refuses mismatched passwords without signing out, and never echoes them", async () => {
    const r = await changePasswordFirstTime(null, fd({ currentPassword: "temp-pass-123", newPassword: "my-own-password-1", confirmPassword: "different-pass-1" }));
    expect(r).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(r?.values).toEqual({});
    expect(changeOwnPassword).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
  it("returns the unauthenticated result without a session", async () => {
    const { UnauthenticatedError } = await import("@/lib/session-core");
    requireUserForPasswordChange.mockRejectedValue(new UnauthenticatedError());
    const r = await changePasswordFirstTime(null, fd({}));
    expect(r).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
    expect(signOut).not.toHaveBeenCalled();
  });
});
