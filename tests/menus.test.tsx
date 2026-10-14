// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within, act } from "@testing-library/react";
import { LibraryRowItem, type RowActions } from "@/components/library/LibraryRow";
import { FilterBar } from "@/components/FilterBar";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { parseParams } from "@/app/(app)/requests/params";
import type { LibraryRow } from "@/lib/libraryView";

// jsdom lacks these; Radix's menu positioning and focus handling call them.
beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
});
afterEach(cleanup);

const old = new Date("2026-01-01T00:00:00Z");
const row: LibraryRow = {
  id: "r1", title: "Alpha deck", url: "https://example.com/x", description: null, categoryId: "c1", brandId: null, brandName: null,
  pinned: false, sortOrder: 0, createdAt: old, contentUpdatedAt: old,
};
const rowActions = (): RowActions => ({
  canUp: false, canDown: true, onEdit: vi.fn(), onDelete: vi.fn(), onPin: vi.fn(), onMove: vi.fn(),
});

/** Radix registers its outside-click listener on the next tick after opening. */
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
const clickOutside = async () => {
  await tick();
  fireEvent.pointerDown(document.body);
  fireEvent.click(document.body);
};

describe("Menus and popovers", () => {
  it("library row actions open a menu, arrow keys move, Esc closes and focus returns to the trigger", async () => {
    const a = rowActions();
    render(<LibraryRowItem row={row} now={new Date("2026-10-10T00:00:00Z")} actions={a} />);
    const trigger = screen.getByRole("button", { name: "Actions for Alpha deck" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    const menu = screen.getByRole("menu", { name: "Actions for Alpha deck" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Edit", "Pin", "Move up", "Move down", "Delete"]);
    // The end it cannot move past is disabled (aria-disabled, skipped by the arrow keys).
    expect(within(menu).getByRole("menuitem", { name: "Move up" }).getAttribute("aria-disabled")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Edit" })));
    // Radix moves focus on the next tick.
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Pin" })));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(within(menu).getByRole("menuitem", { name: "Move down" })));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(a.onMove).not.toHaveBeenCalled();
    // Choosing an item runs it and closes the menu.
    fireEvent.keyDown(trigger, { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    expect(a.onMove).toHaveBeenCalledWith("down");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("menu items keep a 36px target", async () => {
    render(<LibraryRowItem row={row} now={new Date("2026-10-10T00:00:00Z")} actions={rowActions()} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Alpha deck" }), { key: "Enter" });
    for (const item of screen.getAllByRole("menuitem")) expect(item.className).toMatch(/(^|\s)min-h-9(\s|$)/);
  });

  it("FilterBar's filter panel opens as a popover, Apply submits the filters, Esc closes it", async () => {
    const { container } = render(
      <FilterBar p={parseParams({ status: "DONE", motion: "yes" })} brands={[{ id: "b1", name: "Clogent" }]} divisions={[]} assignees={[]} mineHref="/requests?mine=1" clearHref="/requests" />,
    );
    const form = container.querySelector("form")!;
    let submitted: FormData | null = null;
    form.addEventListener("submit", (e) => { e.preventDefault(); submitted = new FormData(form); });
    // Closed: no panel, but the current filters still go with the form (a search keeps them).
    expect(screen.queryByRole("dialog")).toBeNull();
    const closed = new FormData(form);
    expect([closed.get("status"), closed.get("brand"), closed.get("motion")]).toEqual(["DONE", "", "yes"]);

    const trigger = screen.getByRole("button", { name: /^Filters/ });
    expect(trigger.getAttribute("type")).toBe("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Filters" });
    expect(form.contains(panel)).toBe(true);
    fireEvent.change(within(panel).getByLabelText("Brand"), { target: { value: "b1" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Apply" }));
    expect(submitted).not.toBeNull();
    const fd = submitted! as FormData;
    expect([fd.getAll("status"), fd.getAll("brand"), fd.getAll("division"), fd.getAll("assignee"), fd.getAll("motion")])
      .toEqual([["DONE"], ["b1"], [""], [""], ["yes"]]);

    fireEvent.keyDown(document.activeElement ?? panel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    // A change made in the panel is kept (and submitted) after it closes, as the old <details> panel did.
    expect(new FormData(form).getAll("brand")).toEqual(["b1"]);
  });

  it("MonthPicker closes on outside click and Esc", async () => {
    render(<MonthPicker month="2026-03" current="2026-10" action="/dashboard" />);
    const trigger = screen.getByRole("button", { name: "Month: March 2026" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Choose a month" })).toBeTruthy();
    await clickOutside();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose a month" })).toBeNull());

    fireEvent.click(trigger);
    const panel = screen.getByRole("dialog", { name: "Choose a month" });
    fireEvent.keyDown(within(panel).getByRole("link", { name: "May 2026" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose a month" })).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("CollapsibleSection is closed by default and its trigger is the heading row", () => {
    const { container } = render(
      <CollapsibleSection id="timeline" storageKey="menus-test-open" title="Timeline by item" count={2}><p>Body text</p></CollapsibleSection>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Timeline by item (2)" });
    const trigger = within(heading).getByRole("button", { name: "Timeline by item (2)" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    const section = container.querySelector('[data-closed-section="timeline"]')!;
    expect(section.getAttribute("data-state")).toBe("closed");
    // Closed: the body stays in the page (rendered once, so its state survives toggling) but hidden, like <details>.
    expect(screen.getByText("Body text").closest("[hidden]")).not.toBeNull();
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(section.getAttribute("data-state")).toBe("open");
    expect(screen.getByText("Body text").closest("[hidden]")).toBeNull();
    expect(window.localStorage.getItem("menus-test-open")).toBe("1");
    window.localStorage.removeItem("menus-test-open");
  });
});
