// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { MarketingMonthData } from "@/lib/marketing/types";

const load = vi.fn();
let editable: string[] = [];
vi.mock("next/navigation", () => ({ usePathname: () => "/marketing", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/session", () => ({ requireScope: async () => ({ user: { id: "u1", appRole: "CREATIVE" }, db: { scoped: true } }) }));
vi.mock("@/lib/marketing/queries", () => ({
  loadMarketingMonth: async (...a: unknown[]) => {
    load(...a);
    const [, , month, today] = a as [unknown, unknown, string, string];
    const data: MarketingMonthData = { month, today, divisions: [], activities: [], announcements: [], productFocus: null, editableDivisionIds: editable, canManageMonth: false };
    return data;
  },
}));
vi.mock("@/app/(app)/marketing/actions", () => ({
  saveActivity: vi.fn(), deleteActivity: vi.fn(), saveProductFocus: vi.fn(), saveAnnouncement: vi.fn(), deleteAnnouncement: vi.fn(),
}));

import { MarketingContent } from "@/app/(app)/marketing/MarketingContent";

const show = async (month?: string) => render(await MarketingContent({ searchParams: Promise.resolve({ month }) }));

beforeEach(() => { editable = []; load.mockClear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Marketing Calendar page", () => {
  it("titles the page with the month and links to the neighbouring months by name", async () => {
    await show("2026-10");
    expect(screen.getByRole("heading", { level: 1, name: "October 2026" })).toBeTruthy();
    const prev = screen.getByRole("link", { name: "Previous month, September 2026" });
    const next = screen.getByRole("link", { name: "Next month, November 2026" });
    expect([prev.getAttribute("href"), prev.textContent]).toEqual(["/marketing?month=2026-09", "Sep"]);
    expect([next.getAttribute("href"), next.textContent]).toEqual(["/marketing?month=2026-11", "Nov"]);
    expect(screen.queryByRole("link", { name: "Today" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" }).textContent).toContain("Marketing Calendar");
  });

  it("offers Add activity only to someone who can edit a division", async () => {
    await show("2026-10");
    expect(screen.queryByRole("button", { name: "Add activity" })).toBeNull();
    cleanup();
    editable = ["kol"];
    await show("2026-10");
    expect(screen.getByRole("button", { name: "Add activity" })).toBeTruthy();
  });

  it("uses the Jakarta date for today and month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T17:30:00Z")); // already 1 November in Jakarta
    await show();
    expect(load).toHaveBeenCalledWith({ scoped: true }, { id: "u1", appRole: "CREATIVE" }, "2026-11", "2026-11-01");
  });

  it("falls back to the current month on a bad month param", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T03:00:00Z"));
    await show("2026-13");
    expect(screen.getByRole("heading", { level: 1, name: "October 2026" })).toBeTruthy();
  });
});
