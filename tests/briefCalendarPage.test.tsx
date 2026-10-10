// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AppRole } from "@prisma/client";

let role: AppRole = "LEAD";
const ITEMS = [{ id: "i1", title: "Poster", requesterId: "f", requesterName: "Fafa", requestDay: "2026-10-01", typeName: "Social Media", status: "DONE" as const }];
let items = ITEMS;
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/briefs", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/session", () => ({ requireScope: async () => ({ user: { id: "u1", appRole: role }, db: {} }) }));
vi.mock("@/lib/briefCalendarQueries", () => ({ loadBriefItems: async () => items }));

import { BriefContent } from "@/app/(app)/dashboard/briefs/BriefContent";

afterEach(() => { cleanup(); role = "LEAD"; items = ITEMS; });

const show = async (month?: string) => render(await BriefContent({ searchParams: Promise.resolve({ month }) }));

describe("Brief Calendar page", () => {
  it("a requester sees the calendar too (everyone may open it)", async () => {
    role = "REQUESTER";
    await show("2026-10");
    expect(screen.getByRole("heading", { level: 1, name: "Brief Calendar" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Month summary" })).toBeTruthy();
  });

  it("a lead sees the month, the summary and everyone's briefs per week", async () => {
    await show("2026-10");
    expect(screen.getByRole("heading", { level: 1, name: "Brief Calendar" })).toBeTruthy();
    expect(document.querySelector("[data-page-title]")!.textContent).toContain("October 2026");
    expect(screen.getByRole("region", { name: "Month summary" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Briefs per requester per week" }).textContent).toContain("Fafa");
  });

  it("a month without briefs still shows the calendar", async () => {
    items = [];
    await show("2026-10");
    expect(screen.getByText("No briefs this month yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thursday 1 October: no briefs" })).toBeTruthy();
  });
});
