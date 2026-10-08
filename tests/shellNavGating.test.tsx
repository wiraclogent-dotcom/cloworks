// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AppRole } from "@prisma/client";

let role: AppRole = "REQUESTER";
vi.mock("next/navigation", () => ({ usePathname: () => "/requests" }));
vi.mock("@/lib/session", () => ({ requireUserOrRedirect: async () => ({ id: "u1", appRole: role }) }));
vi.mock("@/lib/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { AdminGroup, TeamKpiItem } from "@/components/AppShell";
import { UserChipView } from "@/components/shell/UserChipView";

afterEach(cleanup);

async function renderGated(r: AppRole) {
  role = r;
  const [team, admin] = await Promise.all([TeamKpiItem(), AdminGroup()]);
  return render(<nav aria-label="Main"><ul>{team}</ul>{admin}</nav>);
}

describe("role-gated sidebar items (same can() checks as the pages)", () => {
  it.each(["REQUESTER", "CREATIVE"] as const)("%s sees neither Team KPI nor Admin", async (r) => {
    await renderGated(r);
    expect(screen.queryByRole("link", { name: "Team KPI" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("LEAD sees Team KPI but not Admin", async () => {
    await renderGated("LEAD");
    expect(screen.getByRole("link", { name: "Team KPI" }).getAttribute("href")).toBe("/dashboard/team");
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("ADMIN sees Team KPI and the Admin group", async () => {
    await renderGated("ADMIN");
    expect(screen.getByRole("link", { name: "Team KPI" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Admin" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Admin" }).getAttribute("href")).toBe("/admin/users");
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
