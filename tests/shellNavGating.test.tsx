// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AppRole } from "@prisma/client";

let role: AppRole = "REQUESTER";
vi.mock("next/navigation", () => ({ usePathname: () => "/requests" }));
vi.mock("@/lib/session", () => ({ requireUserOrRedirect: async () => ({ id: "u1", appRole: role, workspaceId: "clogent" }) }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
const findWorkspace = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { workspace: { findUnique: (...a: unknown[]) => findWorkspace(...a) } } }));

import * as Shell from "@/components/AppShell";
import { BriefCalendarItem, TeamKpiItem, WorkspaceName } from "@/components/AppShell";
import { AppFrame } from "@/components/shell/AppFrame";
import { UserChipView } from "@/components/shell/UserChipView";

afterEach(cleanup);

async function renderGated(r: AppRole) {
  role = r;
  const [team, briefs] = await Promise.all([TeamKpiItem(), BriefCalendarItem()]);
  return render(<nav aria-label="Main"><ul>{team}{briefs}</ul></nav>);
}

describe("role-gated sidebar items (same can() checks as the pages)", () => {
  it.each(["REQUESTER", "CREATIVE"] as const)("%s sees neither Team KPI nor Brief Calendar", async (r) => {
    await renderGated(r);
    expect(screen.queryByRole("link", { name: "Team KPI" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Brief Calendar" })).toBeNull();
  });

  it.each(["LEAD", "ADMIN"] as const)("%s sees Brief Calendar", async (r) => {
    await renderGated(r);
    expect(screen.getByRole("link", { name: "Brief Calendar" }).getAttribute("href")).toBe("/dashboard/briefs");
  });

  it.each(["LEAD", "ADMIN"] as const)("%s sees Team KPI", async (r) => {
    await renderGated(r);
    expect(screen.getByRole("link", { name: "Team KPI" }).getAttribute("href")).toBe("/dashboard/team");
  });

  it("there is no Admin group in the sidebar any more (admins reach it from Settings)", () => {
    expect("AdminGroup" in Shell).toBe(false);
  });
});

describe("UserChipView", () => {
  it("shows name and role; the avatar is decorative", () => {
    const { container } = render(<UserChipView name="Wira Budi" roleLabel="Admin" />);
    expect(screen.getByText("Wira Budi")).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("WB");
    expect(container.firstElementChild!.getAttribute("title")).toBe("Wira Budi");
  });
  it("an empty name renders no empty title", () => {
    const { container } = render(<UserChipView name="" roleLabel="Admin" />);
    expect(container.firstElementChild!.hasAttribute("title")).toBe(false);
  });
});

describe("workspace name in the sidebar header", () => {
  it("reads the signed-in user's workspace and shows its name under the app name", async () => {
    findWorkspace.mockResolvedValueOnce({ name: "Clogent" });
    const name = await WorkspaceName();
    expect(findWorkspace).toHaveBeenCalledWith({ where: { id: "clogent" }, select: { name: true } });
    render(<AppFrame nav={null} footer={null} workspace={name}><p>x</p></AppFrame>);
    const label = screen.getByText("Clogent");
    expect(label.previousElementSibling?.textContent).toBe("Cloworks");
    expect(label.className).toContain("text-sidebar-foreground-secondary");
  });
});
