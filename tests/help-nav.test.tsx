// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AppRole } from "@prisma/client";

let role: AppRole = "REQUESTER";

vi.mock("next/navigation", () => ({ usePathname: () => "/requests" }));
vi.mock("@/lib/session", () => ({
  requireUserOrRedirect: async () => ({ id: "u1", appRole: role, jobRole: "CREATIVE" }),
}));
vi.mock("@/lib/auth", () => ({ signOut: async () => {} }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { AppShell } from "@/components/AppShell";

afterEach(cleanup);

// Help center, Dark mode and Sign out moved to the profile menu (tests/profileMenu.test.tsx).
describe("sidebar footer", () => {
  it.each(["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const)("no longer lists Help center, Dark mode or Sign out for %s", async (appRole) => {
    role = appRole as AppRole;
    render(<AppShell><p>page</p></AppShell>);
    await screen.findByRole("link", { name: "Requests" });
    expect(screen.queryByRole("link", { name: "Help center" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Dark mode" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });
});
