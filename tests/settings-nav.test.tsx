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
import { PageHeader } from "@/components/ui/PageHeader";
import { AppFrame } from "@/components/shell/AppFrame";

afterEach(cleanup);

describe("Settings entry point", () => {
  it.each(["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const)("is not in the sidebar for %s", async (appRole) => {
    role = appRole as AppRole;
    render(<AppShell><p>page</p></AppShell>);
    await screen.findByRole("link", { name: "Requests" });
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
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

describe("profile menu placement", () => {
  it("the app frame pins the profile menu at the top right of the content", () => {
    render(<AppFrame nav={null} profile={<button type="button">WI</button>}><p>page</p></AppFrame>);
    const slot = document.querySelector("main [data-profile-slot]")!;
    expect(slot.textContent).toBe("WI");
    expect(slot.className).toContain("right-0");
  });
  it("every page top bar leaves room for it", () => {
    render(<PageHeader title="Team KPI" breadcrumb={[{ label: "Insights" }, { label: "Team KPI" }]} />);
    expect(document.querySelector("[data-top-bar]")!.className).toContain("pr-12");
  });
});
