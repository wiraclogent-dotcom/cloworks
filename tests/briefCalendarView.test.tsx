// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { buildBriefMonth, type BriefItem } from "@/lib/briefCalendar";

let narrow = false;
vi.mock("@/components/useNarrow", () => ({ useNarrow: () => narrow }));

import { BriefCalendar } from "@/components/briefs/BriefCalendar";

let n = 0;
const item = (requesterId: string, requesterName: string, requestDay: string, typeName = "Social Media"): BriefItem =>
  ({ id: `i${++n}`, title: `title ${n}`, requesterId, requesterName, requestDay, typeName, status: "DONE" });
const ITEMS: BriefItem[] = [
  item("f", "Fafa", "2026-10-01"), item("f", "Fafa", "2026-10-03"), item("f", "Fafa", "2026-10-08"), item("f", "Fafa", "2026-10-08"),
  item("d", "Dimas", "2026-10-08", "General Design"),
];
const OCT = buildBriefMonth("2026-10", "2026-10-08", ITEMS);
const DAY8 = "Thursday 8 October: 3 briefs";

beforeEach(() => {
  narrow = false;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(cleanup);

const tile = (label: string) => screen.getByRole("listitem", { name: label });

describe("BriefCalendar", () => {
  it("shows the month summary instead of per-person tiles", () => {
    render(<BriefCalendar model={OCT} />);
    expect(tile("Briefs this month").textContent).toContain("5");
    expect(tile("Today").textContent).toContain("3");
    expect(tile("Per work day").textContent).toContain("0.7"); // 5 briefs over 7 elapsed work days
    expect(tile("Busiest day").textContent).toContain("Thu 8 Oct");
    expect(tile("Busiest day").textContent).toContain("3 briefs");
    expect(screen.getByLabelText("Briefs by type").textContent).toBe("Social Media 4 · General Design 1");
    expect(screen.queryByText(/work days$/)).toBeNull();
  });

  it("a past month shows a dash for Today; an empty month dashes the averages", () => {
    render(<BriefCalendar model={buildBriefMonth("2026-11", "2026-10-08", [])} />);
    expect(tile("Today").textContent).toContain("—");
    expect(tile("Per work day").textContent).toContain("—");
    expect(tile("Busiest day").textContent).toContain("—");
    expect(screen.queryByLabelText("Briefs by type")).toBeNull();
  });

  it("a table of each requester's briefs per week, with not-yet-started weeks as a dash", () => {
    render(<BriefCalendar model={OCT} />);
    const table = screen.getByRole("table", { name: "Briefs per requester per week" });
    const head = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(head).toEqual(["Requester", "1–4 Oct", "5–11 Oct", "12–18 Oct", "19–25 Oct", "26–31 Oct", "Total"]);
    const rows = within(table).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(rows).toEqual([
      ["Fafa", "2", "2", "–", "–", "–", "4"],
      ["Dimas", "0", "1", "–", "–", "–", "1"],
    ]);
  });

  it("with no briefs the table says so", () => {
    render(<BriefCalendar model={buildBriefMonth("2026-10", "2026-10-08", [])} />);
    expect(screen.getByText("No briefs this month yet.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("each day is a labelled button with its brief count; no per-person circles or legend", () => {
    render(<BriefCalendar model={OCT} />);
    expect(screen.getByRole("button", { name: DAY8 }).textContent).toContain("3 briefs");
    expect(screen.getByRole("button", { name: "Thursday 1 October: 1 brief" }).textContent).toContain("1 brief");
    expect(screen.getByRole("button", { name: "Friday 2 October: no briefs" }).textContent).not.toContain("brief");
    expect(document.querySelector("[data-state]")).toBeNull();
    expect(screen.queryByRole("list", { name: "Legend" })).toBeNull();
  });

  it("clicking a day opens a dialog of its briefs grouped by who sent them", () => {
    render(<BriefCalendar model={OCT} />);
    fireEvent.click(screen.getByRole("button", { name: DAY8 }));
    const dialog = screen.getByRole("dialog", { name: "Thursday 8 October" });
    expect(within(dialog).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/requests/i3", "/requests/i4", "/requests/i5"]);
    expect(within(within(dialog).getByRole("group", { name: "Fafa" })).getAllByRole("link")).toHaveLength(2);
    expect(within(within(dialog).getByRole("group", { name: "Dimas" })).getAllByRole("link")).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a day with no briefs says so in its dialog", () => {
    render(<BriefCalendar model={OCT} />);
    fireEvent.click(screen.getByRole("button", { name: "Friday 2 October: no briefs" }));
    expect(within(screen.getByRole("dialog")).getByText("No briefs this day.")).toBeTruthy();
  });

  it("narrow screens get a list of days instead of the grid, opening the same dialog", () => {
    narrow = true;
    render(<BriefCalendar model={OCT} />);
    expect(document.querySelector("[data-weekday]")).toBeNull();
    const list = screen.getByRole("list", { name: "Days" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(31);
    fireEvent.click(within(list).getByRole("button", { name: DAY8 }));
    expect(screen.getByRole("dialog", { name: "Thursday 8 October" })).toBeTruthy();
  });
});
