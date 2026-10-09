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
import { SettingsLink } from "@/components/shell/SettingsLink";
import { PageHeader } from "@/components/ui/PageHeader";

afterEach(cleanup);

describe("Settings entry point", () => {
  it.each(["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const)("is not in the sidebar for %s", async (appRole) => {
    role = appRole as AppRole;
    render(<AppShell><p>page</p></AppShell>);
    await screen.findByRole("link", { name: "Help center" });
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });

  it("the top-bar gear is a live link to /settings", () => {
    render(<SettingsLink />);
    const link = screen.getByRole("link", { name: "Settings" });
    expect(link.getAttribute("href")).toBe("/settings");
    expect(link.getAttribute("title")).toBe("Settings");
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

describe("Settings gear in every page top bar", () => {
  it("appears on any page with a breadcrumb, after the page's own top-bar actions", () => {
    render(<PageHeader title="Projects" breadcrumb={[{ label: "Work" }, { label: "Projects" }]} topBarActions={<button type="button">Bell</button>} />);
    const actions = document.querySelector("[data-top-bar-actions]")!;
    expect(Array.from(actions.children).map((c) => c.textContent || c.getAttribute("aria-label"))).toEqual(["Bell", "Settings"]);
  });
  it("appears even when the page has no top-bar actions of its own", () => {
    render(<PageHeader title="Team KPI" breadcrumb={[{ label: "Insights" }, { label: "Team KPI" }]} />);
    expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  });
});
