// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ viewer: { id: "u1", appRole: "ADMIN", jobRole: "DESIGNER" } as Record<string, string>, suspend: false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/team", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/session", () => ({ requireScope: async () => ({ user: h.viewer, db: {} }) }));
// The sections are async server components (jsdom cannot render those): stand in with what the page hands them.
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => (p: { team: string; keep?: Record<string, string> }) => <p data-testid={name}>{JSON.stringify({ team: p.team, keep: p.keep ?? null })}</p>,
}));
vi.mock("@/components/kpi/sections/TeamSummary", () => ({ TeamSummary: stub("summary") }));
vi.mock("@/components/kpi/sections/TeamRequestsSection", () => ({
  TeamRequestsSection: (p: { team: string }) => {
    if (h.suspend) throw new Promise(() => {}); // still loading: the Suspense fallback shows
    return stub("requests")(p);
  },
}));
vi.mock("@/components/kpi/sections/TeamProjectsSection", () => ({ TeamProjectsSection: stub("projects") }));

import { TeamContent } from "@/app/(app)/dashboard/team/TeamContent";

const show = async (sp: Record<string, string> = {}) => render(await TeamContent({ searchParams: Promise.resolve(sp) }));
const props = (id: string) => JSON.parse(screen.getByTestId(id).textContent!);
afterEach(() => { cleanup(); h.suspend = false; });

describe("Team KPI page", () => {
  it("gives an admin a Creative / Social media switch, on their own team by default", async () => {
    h.viewer = { id: "u1", appRole: "ADMIN", jobRole: "DESIGNER" };
    await show();
    const nav = screen.getByRole("navigation", { name: "Team" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Creative", "Social media"]);
    expect(within(nav).getByRole("link", { name: "Creative" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Request and project KPIs for the creative team")).toBeTruthy();
    expect(props("requests").team).toBe("creative");
  });

  it("keeps the month and year when switching, and the team when picking a month or year", async () => {
    h.viewer = { id: "u1", appRole: "ADMIN", jobRole: "DESIGNER" };
    await show({ team: "social", month: "2026-09", year: "2025" });
    const creative = within(screen.getByRole("navigation", { name: "Team" })).getByRole("link", { name: "Creative" }).getAttribute("href")!;
    expect(creative).toContain("month=2026-09");
    expect(creative).toContain("year=2025");
    expect(creative).toContain("team=creative");
    expect(screen.getByText("Content Plan and project KPIs for the social media team")).toBeTruthy();
    for (const id of ["summary", "requests", "projects"]) expect(props(id).team).toBe("social");
    expect(props("requests").keep).toMatchObject({ year: "2025", team: "social" });
    expect(props("projects").keep).toMatchObject({ month: "2026-09", team: "social" });
  });

  it("a lead gets no switch and their own team, whatever ?team says", async () => {
    h.viewer = { id: "u2", appRole: "LEAD", jobRole: "DESIGNER" };
    await show({ team: "social" });
    expect(screen.queryByRole("navigation", { name: "Team" })).toBeNull();
    expect(props("requests").team).toBe("creative");
  });

  it("while the main section loads, its skeleton is titled for the team", async () => {
    h.viewer = { id: "u1", appRole: "ADMIN", jobRole: "DESIGNER" };
    h.suspend = true;
    await show({ team: "social" });
    expect(screen.getByRole("heading", { name: "Content Plan" })).toBeTruthy();
    cleanup();
    await show();
    expect(screen.getByRole("heading", { name: "Requests" })).toBeTruthy();
  });

  it("a social media lead sees the social media team", async () => {
    h.viewer = { id: "u3", appRole: "LEAD", jobRole: "SOCIAL_MEDIA" };
    await show();
    expect(props("requests").team).toBe("social");
    expect(screen.getByText("Content Plan and project KPIs for the social media team")).toBeTruthy();
  });
});
