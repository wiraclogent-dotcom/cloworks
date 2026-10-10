// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(app)/library/actions", () => ({ moveItem: vi.fn(), setPinned: vi.fn() }));

import { LibraryView } from "@/components/library/LibraryView";
import type { LibraryRow } from "@/lib/libraryView";

afterEach(cleanup);

const now = new Date("2026-10-10T00:00:00Z");
const old = new Date("2026-01-01T00:00:00Z");
const cats = [
  { id: "c1", name: "Product Knowledge", icon: null },
  { id: "c2", name: "Brand Guidelines (NG)", icon: "palette" },
  { id: "c3", name: "Master Box Size", icon: null },
];
const brands = [{ id: "b1", name: "Clogent" }, { id: "b2", name: "Bubble Wash" }];
const row = (o: Partial<LibraryRow> & { id: string; title: string }): LibraryRow => ({
  url: "https://example.com/x", description: null, categoryId: "c1", brandId: null, brandName: null,
  pinned: false, sortOrder: 0, createdAt: old, contentUpdatedAt: old, ...o,
});
const rows = [
  row({ id: "r1", title: "Alpha deck", url: "https://docs.google.com/presentation/d/1", categoryId: "c1", brandId: "b1", brandName: "Clogent", pinned: true, createdAt: new Date("2026-10-03T00:00:00Z"), contentUpdatedAt: new Date("2026-10-03T00:00:00Z") }),
  row({ id: "r2", title: "Beta sheet", description: "sizes", categoryId: "c2", brandId: "b2", brandName: "Bubble Wash" }),
];
const view = (o: Partial<React.ComponentProps<typeof LibraryView>> = {}) =>
  render(<LibraryView rows={rows} categories={cats} brands={brands} canManage={false} now={now} {...o} />);

describe("LibraryView", () => {
  it("shows Pinned only when a filtered row is pinned", () => {
    view();
    expect(screen.getByRole("heading", { name: "Pinned" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search library"), { target: { value: "beta" } });
    expect(screen.queryByRole("heading", { name: "Pinned" })).toBeNull();
  });
  it("hides empty categories for viewers, shows them for managers", () => {
    view();
    expect(screen.queryByRole("heading", { name: "Master Box Size" })).toBeNull();
    cleanup();
    view({ canManage: true });
    expect(screen.getByRole("heading", { name: "Master Box Size" })).toBeTruthy();
  });
  it("shows category chips for empty categories only to managers", () => {
    view();
    expect(screen.queryByRole("button", { name: "Master Box Size" })).toBeNull();
    expect(screen.getByRole("button", { name: "Product Knowledge" })).toBeTruthy();
    cleanup();
    view({ canManage: true });
    expect(screen.getByRole("button", { name: "Master Box Size" })).toBeTruthy();
  });
  it("lists sections in category order", () => {
    view();
    const h = screen.getAllByRole("heading", { level: 2 }).map((e) => e.textContent);
    expect(h).toEqual(["Pinned", "Product Knowledge", "Brand Guidelines (NG)"]);
  });
  it("search filters", () => {
    view();
    fireEvent.change(screen.getByLabelText("Search library"), { target: { value: "sizes" } });
    expect(screen.queryByText("Alpha deck", { selector: "a *, a" })).toBeNull();
    expect(screen.getByText("Beta sheet")).toBeTruthy();
  });
  it("category chip filters and sets aria-pressed", () => {
    view();
    const chip = screen.getByRole("button", { name: "Brand Guidelines (NG)" });
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("Alpha deck")).toBeNull();
    expect(screen.getByText("Beta sheet")).toBeTruthy();
  });
  it("brand select filters", () => {
    view();
    fireEvent.change(screen.getByLabelText("Brand"), { target: { value: "b1" } });
    expect(screen.getAllByText("Alpha deck").length).toBeGreaterThan(0);
    expect(screen.queryByText("Beta sheet")).toBeNull();
  });
  it("shows No links match and Clear filters restores", () => {
    view();
    fireEvent.change(screen.getByLabelText("Search library"), { target: { value: "zzzz" } });
    expect(screen.getByText("No links match")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Beta sheet")).toBeTruthy();
    expect((screen.getByLabelText("Search library") as HTMLInputElement).value).toBe("");
  });
  it("links open in a new tab safely", () => {
    view();
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(3);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });
  it("shows the badge", () => {
    view();
    expect(screen.getAllByText("New · 3 Oct").length).toBeGreaterThan(0);
  });
  it("has no editor controls when canManage is false", () => {
    view();
    expect(screen.queryByRole("button", { name: /Add link/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /menu|actions/i })).toBeNull();
  });
  it("renders a brand tag inside the row", () => {
    view();
    const a = screen.getAllByRole("link").find((l) => l.textContent?.includes("Beta sheet"))!;
    expect(within(a).getByText("Bubble Wash")).toBeTruthy();
  });
});
