// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/session", () => ({
  requireScope: async () => ({
    user: { id: "admin", appRole: "ADMIN", jobRole: "DESIGNER" },
    db: { user: { findUnique: async () => ({ id: "s1", name: "Syahda", jobRole: "SOCIAL_MEDIA" }) } },
  }),
}));
// The sections are async server components (jsdom cannot render those): stand in with the params they keep.
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => (p: { keep?: Record<string, string | undefined> }) => <p data-testid={name}>{JSON.stringify(p.keep ?? null)}</p>,
}));
vi.mock("@/components/kpi/sections/MySummary", () => ({ MySummary: stub("summary") }));
vi.mock("@/components/kpi/sections/MyRequestsSection", () => ({ MyRequestsSection: stub("requests") }));
vi.mock("@/components/kpi/sections/MyProjectsSection", () => ({ MyProjectsSection: stub("projects") }));
vi.mock("@/components/kpi/project/PersonProjectKpiSection", () => ({
  PersonProjectKpiSection: (p: { hrefFor: (q: { year?: number; q?: string }) => string }) => <a href={p.hrefFor({ year: 2025 })}>2025</a>,
}));

import DashboardPage from "@/app/(app)/dashboard/page";
import ProjectKpiPersonPage from "@/app/(app)/dashboard/projects/[userId]/page";

// Each page is a Suspense shell around an async server component: render that component's output directly.
const renderShell = async (page: ReturnType<typeof DashboardPage>) => {
  const content = page.props.children.props.children;
  return render(await content.type(content.props));
};
const show = (sp: Record<string, string>) => renderShell(DashboardPage({ searchParams: Promise.resolve(sp) } as PageProps<"/dashboard">));
const showProjects = (sp: Record<string, string>) =>
  renderShell(ProjectKpiPersonPage({ params: Promise.resolve({ userId: "s1" }), searchParams: Promise.resolve(sp) } as PageProps<"/dashboard/projects/[userId]">));
const keep = (id: string) => JSON.parse(screen.getByTestId(id).textContent!);
/** [breadcrumb "Team KPI", "Back to team"] hrefs: both lead back the same way. */
const backLinks = () => [
  within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Team KPI" }).getAttribute("href"),
  screen.getByRole("link", { name: "Back to team" }).getAttribute("href"),
];
afterEach(cleanup);

describe("person KPI page opened from Team KPI", () => {
  it("leads back to the team, month and year it was opened from, and the pickers keep that team", async () => {
    await show({ user: "s1", month: "2026-10", year: "2025", team: "social" });
    expect(backLinks()).toEqual(Array(2).fill("/dashboard/team?month=2026-10&year=2025&team=social"));
    expect(keep("requests")).toMatchObject({ team: "social" });
    expect(keep("projects")).toMatchObject({ team: "social", user: "s1" });
  });

  it("without a team it goes back to the viewer's own team", async () => {
    await show({ user: "s1", month: "2026-10" });
    expect(backLinks()).toEqual(Array(2).fill("/dashboard/team?month=2026-10"));
  });
});

describe("person Project KPI page opened from Team KPI", () => {
  it("leads back to the team and year it was opened from, and the year links keep that team", async () => {
    await showProjects({ year: "2025", team: "social" });
    expect(backLinks()).toEqual(Array(2).fill("/dashboard/team?year=2025&team=social"));
    const yearLink = screen.getByRole("link", { name: "2025" }).getAttribute("href")!;
    expect(yearLink).toMatch(/^\/dashboard\/projects\/s1\?year=2025&q=\d&team=social$/);
  });

  it("without a team it goes back to the viewer's own team", async () => {
    await showProjects({ year: "2025" });
    expect(backLinks()).toEqual(Array(2).fill("/dashboard/team?year=2025"));
  });
});
