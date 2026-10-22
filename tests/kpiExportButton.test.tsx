// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const teamRequestsData = vi.fn();
vi.mock("@/lib/kpi/pageData", () => ({ teamRequestsData: (...a: unknown[]) => teamRequestsData(...a) }));
vi.mock("@/lib/kpi/roster", () => ({ rosterCandidates: async () => [] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/dashboard/team" }));

import { TeamRequestsSection } from "@/components/kpi/sections/TeamRequestsSection";

const db = {} as never;
const row = { userId: "a", name: "Ayu", role: "DESIGNER", kpi: {
  tasksDone: 1, doneRequestIds: [], target: null, progress: null, onTimeRate: null, avgTurnaroundDays: null,
  revisionRounds: 0, totalOutputs: 0, activeWorkload: 0 } };

afterEach(cleanup);

describe("Team KPI › Requests download", () => {
  it("links to the month's xlsx export", async () => {
    teamRequestsData.mockResolvedValue({ rows: [row], automaticCount: 1 });
    render(await TeamRequestsSection({ db, month: "2026-09", canManage: false }));
    const link = screen.getByRole("link", { name: /download \.xlsx/i });
    expect(link.getAttribute("href")).toBe("/dashboard/team/export?month=2026-09&team=creative");
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("is hidden when nobody is shown", async () => {
    teamRequestsData.mockResolvedValue({ rows: [], automaticCount: 0 });
    render(await TeamRequestsSection({ db, month: "2026-09", canManage: false }));
    expect(screen.queryByRole("link", { name: /download \.xlsx/i })).toBeNull();
  });
});
