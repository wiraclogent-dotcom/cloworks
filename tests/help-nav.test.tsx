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

describe("sidebar Help center link", () => {
  it.each(["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const)("is a live link to /help for %s", async (appRole) => {
    role = appRole as AppRole;
    render(<AppShell><p>page</p></AppShell>);
    const link = await screen.findByRole("link", { name: "Help center" });
    expect(link.getAttribute("href")).toBe("/help");
  });
});
