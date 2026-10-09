// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
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

describe("sidebar Settings link", () => {
  it.each(["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const)("is a live link to /settings for %s", async (appRole) => {
    role = appRole as AppRole;
    render(<AppShell><p>page</p></AppShell>);
    const link = await screen.findByRole("link", { name: "Settings" });
    expect(link.getAttribute("href")).toBe("/settings");
  });
});

describe("sidebar Work group", () => {
  // Role-gated items (Brief Calendar, Team KPI) are async server components and do not stream in this client render;
  // their placement is checked in the browser.
  it("has Requests and Projects and no Workflow placeholder", async () => {
    render(<AppShell><p>page</p></AppShell>);
    const work = await screen.findByRole("list", { name: "Work" });
    expect(within(work).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/requests", "/projects"]);
    expect(screen.queryByText("Workflow")).toBeNull();
  });
});
