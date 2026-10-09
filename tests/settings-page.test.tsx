// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const findUnique = vi.fn();
let appRole = "CREATIVE";
vi.mock("@/lib/session", () => ({
  requireScope: async () => ({
    user: { id: "u1", appRole, jobRole: "DESIGNER", workspaceId: "clogent" },
    db: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
  }),
}));
vi.mock("@/app/(app)/settings/actions", () => ({ changePassword: vi.fn() }));
const ME = { fullName: "Wira Budi", email: "wira@example.com", title: null, department: "Creative", passwordHash: null as string | null };

import { SettingsContent } from "@/app/(app)/settings/SettingsContent";

beforeEach(() => findUnique.mockResolvedValue({ ...ME }));
afterEach(() => { cleanup(); appRole = "CREATIVE"; });

describe("settings: general", () => {
  it("shows the signed-in user's account details read-only", async () => {
    render(await SettingsContent());
    expect(screen.getByRole("heading", { name: "Account" })).toBeTruthy();
    expect(screen.getByText("Wira Budi")).toBeTruthy();
    expect(screen.getByText("wira@example.com")).toBeTruthy();
    expect(screen.getByText("Department").nextElementSibling?.textContent).toBe("Creative");
    expect(screen.getByText("Role").nextElementSibling?.textContent).toBe("Creative");
    expect(screen.queryByRole("textbox")).toBeNull(); // account details are read-only
  });

  it("has no Appearance section (Dark mode lives in the profile menu)", async () => {
    render(await SettingsContent());
    expect(screen.queryByRole("heading", { name: "Appearance" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Dark mode" })).toBeNull();
  });

  it("offers a password change only to people who have a password, and never renders the hash", async () => {
    const { unmount } = render(await SettingsContent());
    expect(screen.getByRole("heading", { name: "Password" })).toBeTruthy();
    expect(screen.queryByLabelText("Current password")).toBeNull();
    expect(screen.getByText(/sign in without a password/i)).toBeTruthy();
    unmount();

    findUnique.mockResolvedValue({ ...ME, passwordHash: "scrypt$32768$8$1$c2FsdA==$TOPSECRETHASH" });
    const { container } = render(await SettingsContent());
    expect(container.innerHTML).not.toContain("TOPSECRETHASH");
    expect((screen.getByLabelText("Current password") as HTMLInputElement).type).toBe("password");
    expect(screen.getByLabelText(/^New password/)).toBeTruthy();
    expect(screen.getByLabelText("Confirm new password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change password" })).toBeTruthy();
  });
});

describe("settings: administration", () => {
  it("admins get an Administration section linking to Users and Lists", async () => {
    appRole = "ADMIN";
    render(await SettingsContent());
    expect(screen.getByRole("heading", { name: "Administration" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Users/ }).getAttribute("href")).toBe("/admin/users");
    expect(screen.getByRole("link", { name: /Lists/ }).getAttribute("href")).toBe("/admin/lists");
  });

  it.each(["REQUESTER", "CREATIVE", "LEAD"])("%s does not see it", async (r) => {
    appRole = r;
    render(await SettingsContent());
    expect(screen.queryByRole("heading", { name: "Administration" })).toBeNull();
  });
});

describe("settings: top bar", () => {
  it("has a Settings breadcrumb top bar (where the profile menu sits)", async () => {
    const { default: SettingsPage } = await import("@/app/(app)/settings/page");
    const { container } = render(<SettingsPage />);
    expect(container.querySelector("[data-top-bar]")!.textContent).toBe("Settings");
  });
});
