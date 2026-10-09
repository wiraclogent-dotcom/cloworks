// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/session", () => ({
  requireUserOrRedirect: async () => ({ id: "u1", appRole: "CREATIVE", jobRole: "DESIGNER" }),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: async () => ({ fullName: "Wira Budi", email: "wira@example.com", title: null, department: "Creative" }),
    },
  },
}));
vi.mock("@/components/ui/ThemeSwitch", () => ({ ThemeSwitch: () => <div>theme switch stub</div> }));

import { SettingsContent } from "@/app/(app)/settings/SettingsContent";

afterEach(cleanup);

describe("settings: general", () => {
  it("shows the signed-in user's account details read-only", async () => {
    render(await SettingsContent());
    expect(screen.getByRole("heading", { name: "Account" })).toBeTruthy();
    expect(screen.getByText("Wira Budi")).toBeTruthy();
    expect(screen.getByText("wira@example.com")).toBeTruthy();
    expect(screen.getByText("Department").nextElementSibling?.textContent).toBe("Creative");
    expect(screen.getByText("Role").nextElementSibling?.textContent).toBe("Creative");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows the appearance section with the theme switch", async () => {
    render(await SettingsContent());
    expect(screen.getByRole("heading", { name: "Appearance" })).toBeTruthy();
    expect(screen.getByText("theme switch stub")).toBeTruthy();
  });
});
