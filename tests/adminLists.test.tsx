// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, act } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  archiveListItem: vi.fn(async () => ({ ok: true })), deleteListItem: vi.fn(async () => ({ ok: true })), saveBrandColor: vi.fn(async () => ({ ok: true })),
  saveBrand: vi.fn(), saveDivision: vi.fn(), saveRequestType: vi.fn(), saveDivisionCalendar: vi.fn(),
}));
vi.mock("@/app/(app)/admin/lists/actions", () => actions);
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(async () => null) },
  brand: { findMany: vi.fn() }, division: { findMany: vi.fn() }, requestType: { findMany: vi.fn() },
}));
vi.mock("@/lib/session", () => ({
  requireScope: async () => ({ user: { id: "a", appRole: "ADMIN", jobRole: "OTHER" }, db: prismaMock }),
}));

import { ListsContent } from "@/app/(app)/admin/lists/ListsContent";

const ARCHIVED = new Date("2026-10-20T00:00:00Z");
const brand = (id: string, name: string, c: Partial<Record<"requests" | "projects" | "libraryItems" | "socialChannels", number>>, extra = {}) =>
  ({ id, name, color: "tag-neutral", archivedAt: null, _count: { requests: 0, projects: 0, libraryItems: 0, socialChannels: 0, ...c }, ...extra });

class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  vi.clearAllMocks();
  prismaMock.brand.findMany.mockResolvedValue([
    brand("b1", "Clogent", { requests: 508, projects: 7, libraryItems: 35, socialChannels: 1 }, { color: "tag-clogent" }),
    brand("b2", "Typo", {}),
    brand("b3", "Clenvo", { projects: 3 }, { archivedAt: ARCHIVED }),
  ]);
  prismaMock.division.findMany.mockResolvedValue([
    { id: "d1", name: "Ecommerce", archivedAt: null, _count: { requests: 45, marketingActivities: 0 } },
    { id: "d2", name: "KOL", archivedAt: null, _count: { requests: 0, marketingActivities: 0 } },
  ]);
  prismaMock.requestType.findMany.mockResolvedValue([
    { id: "t1", name: "Social Media", active: true, fieldSchema: [], _count: { requests: 124, contentPosts: 0 } },
    { id: "t2", name: "Retired", active: false, fieldSchema: [], _count: { requests: 0, contentPosts: 0 } },
  ]);
});
afterEach(cleanup);

const openMenu = async (name: string) => {
  fireEvent.keyDown(screen.getByRole("button", { name: `Actions for ${name}` }), { key: "Enter" });
  return screen.findByRole("menu");
};

describe("Settings › Lists", () => {
  it("explains archiving instead of 'nothing can be deleted'", async () => {
    render(await ListsContent());
    expect(screen.getByText("Brands, divisions and request types used across Clowork. Archive what you no longer use: it disappears from new forms, and old work keeps its name.")).toBeTruthy();
    expect(screen.queryByText(/Nothing here can be deleted/)).toBeNull();
    expect(screen.getByText("Shown on requests, projects, Content Plan channels and Library items.")).toBeTruthy();
  });

  it("shows what uses each item", async () => {
    render(await ListsContent());
    expect(screen.getByText("508 requests · 7 projects · 35 library items · 1 Instagram channel")).toBeTruthy();
    expect(screen.getAllByText("Not used yet").length).toBeGreaterThanOrEqual(2); // Typo, KOL
    expect(screen.getByText("124 requests")).toBeTruthy();
  });

  it("archived items wait in a closed Archived group", async () => {
    render(await ListsContent());
    const toggle = screen.getAllByRole("button", { name: "Archived (1)" })[0];
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Name of Clenvo")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByText("3 projects")).toBeTruthy();
  });

  it("Archive is offered for a used brand, Delete only for an unused one", async () => {
    render(await ListsContent());
    const menu = await openMenu("Clogent");
    expect(within(menu).queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await act(async () => { fireEvent.click(within(menu).getByRole("menuitem", { name: "Archive" })); });
    expect(actions.archiveListItem).toHaveBeenCalledWith("brand", "b1", true);
  });

  it("deleting an unused brand asks first", async () => {
    render(await ListsContent());
    const menu = await openMenu("Typo");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Delete Typo?");
    expect(dialog.textContent).toContain("It isn't used anywhere. This can't be undone.");
    expect(dialog.textContent?.match(/Delete Typo\?/g)).toHaveLength(1);
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Delete" })); });
    expect(actions.deleteListItem).toHaveBeenCalledWith("brand", "b2");
  });

  it("an archived item can be restored", async () => {
    render(await ListsContent());
    fireEvent.click(screen.getAllByRole("button", { name: "Archived (1)" })[0]);
    const menu = await openMenu("Clenvo");
    await act(async () => { fireEvent.click(within(menu).getByRole("menuitem", { name: "Restore" })); });
    expect(actions.archiveListItem).toHaveBeenCalledWith("brand", "b3", false);
  });

  it("a brand's colour is picked from 11 labelled swatches and saved at once", async () => {
    render(await ListsContent());
    fireEvent.click(screen.getByRole("button", { name: "Colour of Clogent: Brand blue" }));
    const group = await screen.findByRole("radiogroup", { name: "Colour of Clogent" });
    expect(within(group).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(
      ["Brand blue", "Aqua", "Blue", "Coral", "Green", "Amber", "Pink", "Violet", "Teal", "Slate", "Grey"]);
    await act(async () => { fireEvent.click(within(group).getByRole("radio", { name: "Coral" })); });
    expect(actions.saveBrandColor).toHaveBeenCalledWith("b1", "div-2");
  });

  it("an archived request type is marked and can be restored", async () => {
    render(await ListsContent());
    const archivedGroups = screen.getAllByRole("button", { name: "Archived (1)" });
    fireEvent.click(archivedGroups[archivedGroups.length - 1]);
    const menu = await openMenu("Retired");
    await act(async () => { fireEvent.click(within(menu).getByRole("menuitem", { name: "Restore" })); });
    expect(actions.archiveListItem).toHaveBeenCalledWith("type", "t2", false);
  });
});
