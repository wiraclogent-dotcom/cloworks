// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FilterBar } from "@/components/FilterBar";
import { parseParams } from "@/app/(app)/requests/params";

afterEach(cleanup);
const bar = (raw: Record<string, string>) =>
  render(<FilterBar p={parseParams(raw)} brands={[]} divisions={[]} assignees={[]} mineHref="/requests?mine=1" clearHref="/requests" />);
const hidden = (c: HTMLElement) => Object.fromEntries([...c.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((i) => [i.name, i.value]));

describe("FilterBar", () => {
  it("carries the current table sort and direction through Apply", () => {
    const { container } = bar({ view: "table", sort: "title", dir: "desc" });
    expect(hidden(container)).toEqual({ view: "table", sort: "title", dir: "desc" });
  });
  it("adds nothing extra for the default view", () => {
    expect(hidden(bar({}).container)).toEqual({});
  });
  it("uses aria-current, not the invalid aria-pressed, on the My requests link", () => {
    bar({ mine: "1" });
    const link = screen.getByRole("link", { name: /My requests/ });
    expect(link.getAttribute("aria-current")).toBe("true");
    expect(link.hasAttribute("aria-pressed")).toBe(false);
    // Phase B1: the "✓ " text became a check icon (state is announced by aria-current).
    expect(link.querySelector('svg[data-icon="check"]')).toBeTruthy();
  });
  it("lists only the open statuses in the calendar view", () => {
    bar({ view: "calendar" });
    const opts = [...screen.getByLabelText("Status").querySelectorAll("option")].map((o) => o.textContent);
    expect(opts).toEqual(["All", "Requested", "On progress", "First look"]);
  });
  it("carries the month through Apply in the calendar view", () => {
    const { container } = bar({ view: "calendar", month: "2026-03" });
    expect(hidden(container)).toEqual({ view: "calendar", month: "2026-03" });
  });
  it("lists only the open statuses in the timeline view", () => {
    bar({ view: "timeline" });
    const opts = [...screen.getByLabelText("Status").querySelectorAll("option")].map((o) => o.textContent);
    expect(opts).toEqual(["All", "Requested", "On progress", "First look"]);
  });
  it("carries the week through Apply in the timeline view", () => {
    const { container } = bar({ view: "timeline", week: "2026-10-12" });
    expect(hidden(container)).toEqual({ view: "timeline", week: "2026-10-12" });
  });

  // Regression: Clear filters / My requests are soft navigations to the same page, so the form was reused and the
  // uncontrolled fields kept the old values (and the next Apply quietly put the cleared filters back).
  it("shows the new filters, and closes the panel, when the URL's filters change without a remount", () => {
    const props = { brands: [], divisions: [], assignees: [], mineHref: "/requests?mine=1", clearHref: "/requests" };
    const { container, rerender } = render(<FilterBar p={parseParams({ status: "DONE", q: "ads" })} {...props} />);
    container.querySelector("details")!.open = true;
    rerender(<FilterBar p={parseParams({})} {...props} />);
    expect(container.querySelector<HTMLSelectElement>('select[name="status"]')!.value).toBe("");
    expect(container.querySelector<HTMLInputElement>('input[name="q"]')!.value).toBe("");
    expect(container.querySelector("details")!.open).toBe(false);
  });
});
