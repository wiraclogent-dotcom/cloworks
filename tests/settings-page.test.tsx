// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/session", () => ({
  requireUserOrRedirect: async () => ({ id: "u1", appRole: "CREATIVE", jobRole: "DESIGNER" }),
}));
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
vi.mock("@/app/(app)/settings/actions", () => ({ changePassword: vi.fn() }));
const ME = { fullName: "Wira Budi", email: "wira@example.com", title: null, department: "Creative", passwordHash: null as string | null };
vi.mock("@/components/ui/ThemeSwitch", () => ({ ThemeSwitch: () => <div>theme switch stub</div> }));

import { SettingsContent } from "@/app/(app)/settings/SettingsContent";

beforeEach(() => findUnique.mockResolvedValue({ ...ME }));
afterEach(cleanup);

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

  it("shows the appearance section with the theme switch", async () => {
    render(await SettingsContent());
    expect(screen.getByRole("heading", { name: "Appearance" })).toBeTruthy();
    expect(screen.getByText("theme switch stub")).toBeTruthy();
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
