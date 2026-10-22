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

  it("draws a dashed rule across the day columns at the top of every lane", () => {
    render(<MarketingCalendar data={OCTOBER} />);
    for (const w of screen.getAllByRole("group", { name: /^Week of / })) {
      const rules = [...w.querySelectorAll<HTMLElement>("[data-lane-rule]")];
      expect(rules).toHaveLength(4);
      for (const r of rules) expect(r.style.gridColumn).toBe("2 / -1");
    }
  });

  it("marks today", () => {
    render(<MarketingCalendar data={OCTOBER} />);
    const today = document.querySelector('[aria-current="date"]')!;
    expect(today.textContent).toContain("19");
  });

  it("leaves announcements to the band above: no Notice row in the grid", () => {
    render(<MarketingCalendar data={OCTOBER} />);
    expect(screen.queryByText("Notice")).toBeNull();
    expect(screen.queryByText(/Inbound China/)).toBeNull();
  });

  it("outlines confirmed bars instead of a coloured left edge", () => {
    render(<MarketingCalendar data={OCTOBER} />);
    const bar = screen.getAllByRole("button", { name: "Digital Ads: Payday flight Meta, 24–31 Oct, confirmed" })[0];
    expect(bar.className).not.toMatch(/border-l-3/);
    expect(bar.className).toMatch(/\bborder\b.*border-tone-accent/);
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
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Brand", "Digital Ads", "KOL", "Social Media"]);
    const brand = screen.getByRole("region", { name: "Brand" });
    expect(within(brand).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["5–9 OctRebranding launchConfirmed", "21 OctBrand photoshootPlanned"]);
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
