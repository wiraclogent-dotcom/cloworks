// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { buildBriefMonth, type BriefItem, type BriefPerson } from "@/lib/briefCalendar";

let narrow = false;
vi.mock("@/components/useNarrow", () => ({ useNarrow: () => narrow }));

import { BriefCalendar } from "@/components/briefs/BriefCalendar";

const PEOPLE: BriefPerson[] = [{ id: "r", name: "r" }, { id: "f", name: "f" }, { id: "s", name: "s" }];
let n = 0;
const item = (requesterId: string, requestDay: string): BriefItem =>
  ({ id: `i${++n}`, title: `title ${n}`, requesterId, requestDay, typeName: "Social Media", status: "DONE" });
const ITEMS: BriefItem[] = [
  item("f", "2026-10-01"), item("f", "2026-10-03"), item("f", "2026-10-08"), item("f", "2026-10-08"),
  item("s", "2026-10-08"),
];
const OCT = buildBriefMonth("2026-10", "2026-10-08", PEOPLE, ITEMS);
const DAY8 = "Thursday 8 October: r 0, f 2, s 1";

beforeEach(() => {
  narrow = false;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(cleanup);

const tile = (name: string) => screen.getByRole("listitem", { name: `${name} summary` });

describe("BriefCalendar", () => {
  it("shows a legend and one summary tile per person", () => {
    render(<BriefCalendar people={PEOPLE} model={OCT} />);
    const legend = screen.getByRole("list", { name: "Legend" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["r", "f", "s"]);
    expect(tile("f").textContent).toContain("3 / 7 work days");
    expect(tile("f").textContent).toContain("4 briefs");
    expect(tile("r").textContent).toContain("0 / 7 work days");
    expect(tile("r").textContent).toContain("0 briefs");
  });

  it("the legend sits below the calendar", () => {
    render(<BriefCalendar people={PEOPLE} model={OCT} />);
    const legend = screen.getByRole("list", { name: "Legend" });
    const lastDay = screen.getByRole("button", { name: /^Saturday 31 October/ });
    expect(lastDay.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a future month shows a dash instead of 0 / 0", () => {
    render(<BriefCalendar people={PEOPLE} model={buildBriefMonth("2026-11", "2026-10-08", PEOPLE, [])} />);
    expect(tile("f").textContent).toContain("—");
    expect(tile("f").textContent).not.toContain("0 / 0");
  });

  it("each day is a labelled button with sent and missed dots and a count badge", () => {
    render(<BriefCalendar people={PEOPLE} model={OCT} />);
    const day = screen.getByRole("button", { name: DAY8 });
    expect(day.querySelectorAll('[data-state="missed"]')).toHaveLength(1);
    expect(day.querySelectorAll('[data-state="sent"]')).toHaveLength(2);
    expect(day.querySelector('[data-person="f"]')!.textContent).toBe("2");
  });

  it("each circle has a hover tooltip with the person's name, count and that day's brief titles", () => {
    render(<BriefCalendar people={PEOPLE} model={OCT} />);
    const day = screen.getByRole("button", { name: DAY8 });
    const tips = Array.from(day.querySelectorAll("[data-tooltip]"));
    expect(tips.map((t) => t.querySelector("[data-tooltip-head]")!.textContent)).toEqual(["r · no brief", "f · 2 briefs", "s · 1 brief"]);
    expect(Array.from(tips[1].querySelectorAll("li")).map((li) => li.textContent)).toEqual(["title 3", "title 4"]);
    expect(Array.from(tips[2].querySelectorAll("li")).map((li) => li.textContent)).toEqual(["title 5"]);
    expect(tips[0].querySelectorAll("li")).toHaveLength(0);
  });

  it("an empty Sunday shows no missed dot; Saturday is a work day", () => {
    render(<BriefCalendar people={PEOPLE} model={OCT} />);
    const sun = screen.getByRole("button", { name: /^Sunday 4 October/ });
    expect(sun.querySelectorAll("[data-state]")).toHaveLength(0);
    const sat = screen.getByRole("button", { name: /^Saturday 3 October/ });
    expect(sat.querySelectorAll('[data-state="sent"]')).toHaveLength(1);
    expect(sat.querySelectorAll('[data-state="missed"]')).toHaveLength(2);
  });

  it("each person keeps a fixed slot, so a lone Sunday dot stays in its owner's position", () => {
    const model = buildBriefMonth("2026-10", "2026-10-08", PEOPLE, [item("s", "2026-10-04")]);
    render(<BriefCalendar people={PEOPLE} model={model} />);
    const sun = screen.getByRole("button", { name: /^Sunday 4 October/ });
    const slots = Array.from(sun.querySelectorAll("[data-slot]"));
    expect(slots.map((el) => el.getAttribute("data-slot"))).toEqual(["r", "f", "s"]);
    expect(slots[2].querySelector('[data-state="sent"]')).toBeTruthy();
    expect(slots[0].querySelector("[data-state]")).toBeNull();
  });

  it("clicking a day opens a dialog of its requests grouped by person", () => {
    render(<BriefCalendar people={PEOPLE} model={OCT} />);
    fireEvent.click(screen.getByRole("button", { name: DAY8 }));
    const dialog = screen.getByRole("dialog", { name: "Thursday 8 October" });
    const links = within(dialog).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/requests/i3", "/requests/i4", "/requests/i5"]);
    const rGroup = within(dialog).getByRole("group", { name: "r" });
    expect(rGroup.textContent).toContain("No brief");
    expect(within(within(dialog).getByRole("group", { name: "f" })).getAllByRole("link")).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("narrow screens get a list of days instead of the grid, opening the same dialog", () => {
    narrow = true;
    render(<BriefCalendar people={PEOPLE} model={OCT} />);
    expect(document.querySelector("[data-weekday]")).toBeNull();
    const list = screen.getByRole("list", { name: "Days" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(31);
    fireEvent.click(within(list).getByRole("button", { name: DAY8 }));
    expect(screen.getByRole("dialog", { name: "Thursday 8 October" })).toBeTruthy();
  });
});
