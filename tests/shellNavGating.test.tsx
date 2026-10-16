// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AppRole } from "@prisma/client";

let role: AppRole = "REQUESTER";
let email: string | null = "member@clogent.co.id";
vi.mock("next/navigation", () => ({ usePathname: () => "/requests" }));
vi.mock("@/lib/session", () => ({
  requireUserOrRedirect: async () => ({ id: "u1", appRole: role, workspaceId: "clogent" }),
  dbFor: () => ({ user: { findUnique: async () => ({ email }) } }),
}));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
const findWorkspace = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { workspace: { findUnique: (...a: unknown[]) => findWorkspace(...a) } } }));

import * as Shell from "@/components/AppShell";
import { BriefCalendarItem, TeamKpiItem, WorkspaceName } from "@/components/AppShell";
import { AppFrame } from "@/components/shell/AppFrame";

afterEach(() => { cleanup(); delete process.env.PLATFORM_ADMIN_EMAILS; email = "member@clogent.co.id"; });

async function renderGated(r: AppRole) {
  role = r;
  const [team, briefs] = await Promise.all([TeamKpiItem(), BriefCalendarItem()]);
  return render(<nav aria-label="Main"><ul>{team}{briefs}</ul></nav>);
}

describe("role-gated sidebar items (same can() checks as the pages)", () => {
  it.each(["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const)("%s sees Brief Calendar", async (r) => {
    await renderGated(r);
    expect(screen.getByRole("link", { name: "Brief Calendar" }).getAttribute("href")).toBe("/dashboard/briefs");
  });

  it.each(["REQUESTER", "CREATIVE", "LEAD", "ADMIN"] as const)("%s sees Team KPI", async (r) => {
    await renderGated(r);
    expect(screen.getByRole("link", { name: "Team KPI" }).getAttribute("href")).toBe("/dashboard/team");
  });

  it.each(["REQUESTER", "CREATIVE", "LEAD"] as const)("%s does not see the Admin group", async (r) => {
    role = r;
    const { container } = render(<nav aria-label="Main">{await Shell.AdminNavGroup()}</nav>);
    expect(container.textContent).toBe("");
  });

  it("admins see the Admin group with Members and Lists, and no Waitlist unless they run Clowork", async () => {
    role = "ADMIN";
    process.env.PLATFORM_ADMIN_EMAILS = "owner@clowork.my.id";
    render(<nav aria-label="Main">{await Shell.AdminNavGroup()}</nav>);
    expect(screen.getByRole("link", { name: "Members" }).getAttribute("href")).toBe("/admin/users");
    expect(screen.getByRole("link", { name: "Lists" }).getAttribute("href")).toBe("/admin/lists");
    expect(screen.queryByRole("link", { name: "Waitlist" })).toBeNull();
  });

  it("an admin who is a platform admin also sees Waitlist, after Lists", async () => {
    role = "ADMIN";
    email = "Owner@Clowork.my.id";
    process.env.PLATFORM_ADMIN_EMAILS = "owner@clowork.my.id";
    render(<nav aria-label="Main">{await Shell.AdminNavGroup()}</nav>);
    const links = screen.getAllByRole("link").map((a) => a.textContent);
    expect(links).toEqual(["Members", "Lists", "Waitlist"]);
    expect(screen.getByRole("link", { name: "Waitlist" }).getAttribute("href")).toBe("/admin/waitlist");
  });

  it("a platform admin who is not a workspace admin gets an Admin group with only Waitlist", async () => {
    role = "CREATIVE";
    email = "owner@clowork.my.id";
    process.env.PLATFORM_ADMIN_EMAILS = "owner@clowork.my.id";
    render(<nav aria-label="Main">{await Shell.AdminNavGroup()}</nav>);
    expect(screen.getAllByRole("link").map((a) => a.textContent)).toEqual(["Waitlist"]);
  });

  it("a viewer with no login email never sees Waitlist", async () => {
    role = "ADMIN";
    email = null;
    process.env.PLATFORM_ADMIN_EMAILS = "owner@clowork.my.id";
    render(<nav aria-label="Main">{await Shell.AdminNavGroup()}</nav>);
    expect(screen.queryByRole("link", { name: "Waitlist" })).toBeNull();
  });
});


describe("workspace name in the sidebar header", () => {
  it("reads the signed-in user's workspace and shows its name under the app name", async () => {
    findWorkspace.mockResolvedValueOnce({ name: "Clogent" });
    const name = await WorkspaceName();
    expect(findWorkspace).toHaveBeenCalledWith({ where: { id: "clogent" }, select: { name: true } });
    render(<AppFrame nav={null} footer={null} workspace={name}><p>x</p></AppFrame>);
    const label = screen.getByText("Clogent");
    expect(label.previousElementSibling?.textContent).toBe("Clowork");
    expect(label.className).toContain("text-sidebar-foreground-secondary");
  });
});
