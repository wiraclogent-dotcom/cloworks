// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

let narrow = false;
vi.mock("@/components/useNarrow", () => ({ useNarrow: () => narrow }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/(app)/marketing/actions", () => ({
  saveActivity: vi.fn(), deleteActivity: vi.fn(), saveProductFocus: vi.fn(), saveAnnouncement: vi.fn(), deleteAnnouncement: vi.fn(),
}));

import { MarketingCalendar } from "@/components/marketing/MarketingCalendar";
import { OCTOBER } from "./helpers/marketingFixture";
import { MarketingSheetProvider } from "@/components/marketing/sheetState";

afterEach(() => { cleanup(); narrow = false; });

describe("MarketingCalendar grid", () => {
  it("draws each activity as a labelled bar, split at week edges", () => {
    render(<MarketingCalendar data={OCTOBER} />);
    expect(screen.getAllByRole("button", { name: "Digital Ads: Payday flight Meta, 24–31 Oct, confirmed" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Brand: Brand photoshoot, 21 Oct, planned" }).getAttribute("data-status")).toBe("PLANNED");
    expect(screen.getAllByRole("button", { name: /^Social Media: Halloween series/ })[0].getAttribute("data-status")).toBe("CANCELLED");
  });

  it("labels every lane with its division in every week", () => {
    render(<MarketingCalendar data={OCTOBER} />);
    const weeks = screen.getAllByRole("group", { name: /^Week of / });
    expect(weeks).toHaveLength(5);
    for (const w of weeks) expect(within(w).getAllByText(/^(Brand|Digital Ads|KOL|Social Media)$/).map((e) => e.textContent)).toEqual(["Brand", "Digital Ads", "KOL", "Social Media"]);
  });

  it("marks today", () => {
    render(<MarketingCalendar data={OCTOBER} />);
    const today = document.querySelector('[aria-current="date"]')!;
    expect(today.textContent).toContain("19");
  });

  it("shows dated announcements as a Notice row only in their week", () => {
    render(<MarketingCalendar data={OCTOBER} />);
    expect(screen.getAllByRole("button", { name: "Notice: Inbound China (Pitbond), 22–24 Oct" })).toHaveLength(1);
    const weeks = screen.getAllByRole("group", { name: /^Week of / });
    expect(weeks.map((w) => within(w).queryAllByText("Notice").length)).toEqual([0, 0, 0, 1, 0]);
    expect(screen.queryByText("Budget Q4 approved")).toBeNull();
  });

  it("hides and shows divisions with the legend chips", () => {
    render(<MarketingCalendar data={OCTOBER} />);
    const kol = screen.getByRole("button", { name: "KOL", pressed: true });
    fireEvent.click(kol);
    expect(kol.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryAllByRole("button", { name: /^KOL: / })).toHaveLength(0);
    for (const name of ["Brand", "Digital Ads", "Social Media"]) fireEvent.click(screen.getByRole("button", { name, pressed: true }));
    expect(screen.getByText("All divisions are hidden.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getAllByRole("button", { name: /^KOL: KOL batch 3 posting/ })).toHaveLength(2);
  });

  it("offers add buttons only in the lanes the viewer leads", () => {
    render(<MarketingCalendar data={{ ...OCTOBER, editableDivisionIds: ["kol"] }} />);
    expect(screen.getByRole("button", { name: "Add activity to KOL on 22 Oct" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add activity to Brand on 22 Oct" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add activity to KOL on 10 Oct" })).toBeNull(); // KOL batch 3 covers it
  });

  it("gives a member no add buttons", () => {
    render(<MarketingCalendar data={OCTOBER} />);
    expect(screen.queryAllByRole("button", { name: /^Add activity to / })).toHaveLength(0);
  });

  it("explains an empty calendar, with setup for admins", () => {
    render(<MarketingCalendar data={{ ...OCTOBER, divisions: [], activities: [] }} />);
    expect(screen.getByText("No divisions on the Marketing Calendar yet")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Set up divisions" })).toBeNull();
    cleanup();
    render(<MarketingCalendar data={{ ...OCTOBER, divisions: [], activities: [], canManageMonth: true }} />);
    expect(screen.getByRole("link", { name: "Set up divisions" }).getAttribute("href")).toBe("/admin/lists");
  });
});

describe("MarketingCalendar on a narrow screen", () => {
  it("shows an agenda per division instead of the grid", () => {
    narrow = true;
    render(<MarketingCalendar data={OCTOBER} />);
    expect(screen.queryAllByRole("group", { name: /^Week of / })).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Notice", "Brand", "Digital Ads", "KOL", "Social Media"]);
    const brand = screen.getByRole("region", { name: "Brand" });
    expect(within(brand).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["5–9 OctRebranding launchConfirmed", "21 OctBrand photoshootPlanned"]);
    expect(within(screen.getByRole("region", { name: "Notice" })).getByText("22–24 Oct")).toBeTruthy();
  });

  it("says when a division has nothing this month and respects the filter", () => {
    narrow = true;
    render(<MarketingCalendar data={{ ...OCTOBER, activities: OCTOBER.activities.filter((a) => a.divisionId !== "kol") }} />);
    expect(within(screen.getByRole("region", { name: "KOL" })).getByText("No activities this month")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "KOL", pressed: true }));
    expect(screen.queryByRole("region", { name: "KOL" })).toBeNull();
  });

  it("leaves out activities that only touch the neighbouring months' grid days", () => {
    narrow = true;
    render(<MarketingCalendar data={{ ...OCTOBER, activities: [{ ...OCTOBER.activities[0], id: "x", title: "September only", startDay: "2026-09-28", endDay: "2026-09-30" }] }} />);
    expect(screen.queryByText("September only")).toBeNull();
  });

  it("opens the sheet from a row", async () => {
    narrow = true;
    render(<MarketingSheetProvider data={OCTOBER}><MarketingCalendar data={OCTOBER} /></MarketingSheetProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Brand: Brand photoshoot, 21 Oct, planned" }));
    expect(await screen.findByRole("dialog", { name: "Brand photoshoot" })).toBeTruthy();
  });
});
