// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, back: vi.fn() }) }));
const A = vi.hoisted(() => ({
  createItem: vi.fn(), updateItem: vi.fn(), deleteItem: vi.fn(), setPinned: vi.fn(), moveItem: vi.fn(),
  createCategory: vi.fn(), updateCategory: vi.fn(), moveCategory: vi.fn(), deleteCategory: vi.fn(),
}));
vi.mock("@/app/(app)/library/actions", () => A);

import { LibraryView } from "@/components/library/LibraryView";
import type { LibraryRow } from "@/lib/libraryView";

beforeEach(() => {
  refresh.mockReset();
  for (const f of Object.values(A)) f.mockReset().mockResolvedValue({ ok: true });
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(cleanup);

const old = new Date("2026-01-01T00:00:00Z");
const cats = [
  { id: "c1", name: "Product Knowledge", icon: null },
  { id: "c2", name: "Master Box Size", icon: "box" },
];
const row = (o: Partial<LibraryRow> & { id: string; title: string }): LibraryRow => ({
  url: "https://example.com/x", description: null, categoryId: "c1", brandId: null, brandName: null,
  pinned: false, sortOrder: 0, createdAt: old, contentUpdatedAt: old, ...o,
});
const rows = [
  row({ id: "r1", title: "Alpha deck", description: "notes" }),
  row({ id: "r2", title: "Beta sheet", brandId: "b1", brandName: "Clogent" }),
];
const brandOptions = [{ id: "b1", name: "Clogent" }, { id: "b2", name: "Bubble Wash" }];
const view = (o: Partial<React.ComponentProps<typeof LibraryView>> = {}) =>
  render(<LibraryView rows={rows} categories={cats} brands={[]} brandOptions={brandOptions} canManage now={new Date("2026-10-10T00:00:00Z")} {...o} />);
const menu = (title: string, item: string) => {
  fireEvent.click(screen.getByRole("button", { name: `Actions for ${title}` }));
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
};

describe("Library editor", () => {
  it("shows no controls to viewers", () => {
    view({ canManage: false });
    expect(screen.queryByRole("button", { name: "Add link" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Manage categories" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });

  it("Add link creates with trimmed values", async () => {
    A.createItem.mockResolvedValue({ ok: true, id: "n" });
    view();
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    const d = screen.getByRole("dialog", { name: "Add link" });
    for (const l of ["Title", "Link", "Description", "Category", "Brand", "Pinned"]) expect(within(d).getByLabelText(l)).toBeTruthy();
    fireEvent.change(within(d).getByLabelText("Title"), { target: { value: "  New one  " } });
    fireEvent.change(within(d).getByLabelText("Link"), { target: { value: " https://a.test/z " } });
    fireEvent.change(within(d).getByLabelText("Category"), { target: { value: "c2" } });
    fireEvent.click(within(d).getByRole("button", { name: "Add link" }));
    await waitFor(() => expect(A.createItem).toHaveBeenCalledWith({
      title: "New one", url: "https://a.test/z", description: null, categoryId: "c2", brandId: null, pinned: false, files: [],
    }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("renders a returned url field error next to Link", async () => {
    A.createItem.mockResolvedValue({ ok: false, code: "VALIDATION", message: "x", fieldErrors: { url: "Link must be an http(s) link" } });
    view();
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    const d = screen.getByRole("dialog", { name: "Add link" });
    fireEvent.change(within(d).getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.click(within(d).getByRole("button", { name: "Add link" }));
    const err = await within(d).findByText("Link must be an http(s) link");
    const input = within(d).getByLabelText("Link");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(err.closest("p")!.id);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("edits extra files: pre-filled, add one, remove one, trimmed on save", async () => {
    view({ rows: [row({ id: "r9", title: "Box", files: [{ label: "AI", url: "https://d.test/ai" }, { label: "Mockup", url: "https://d.test/m" }] })] });
    menu("Box", "Edit");
    const d = screen.getByRole("dialog", { name: "Edit link" });
    const files = within(d).getByRole("group", { name: "Extra files" });
    expect((within(files).getAllByLabelText("File label") as HTMLInputElement[]).map((i) => i.value)).toEqual(["AI", "Mockup"]);
    fireEvent.click(within(files).getByRole("button", { name: "Remove file Mockup" }));
    fireEvent.click(within(files).getByRole("button", { name: "Add file" }));
    const labels = within(files).getAllByLabelText("File label");
    const links = within(files).getAllByLabelText("File link");
    fireEvent.change(labels[1], { target: { value: " PDF " } });
    fireEvent.change(links[1], { target: { value: " https://d.test/pdf " } });
    fireEvent.click(within(d).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(A.updateItem).toHaveBeenCalledWith("r9", expect.objectContaining({
      files: [{ label: "AI", url: "https://d.test/ai" }, { label: "PDF", url: "https://d.test/pdf" }],
    })));
  });

  it("drops fully empty file rows and caps the list at 6", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    const files = within(screen.getByRole("dialog", { name: "Add link" })).getByRole("group", { name: "Extra files" });
    for (let i = 0; i < 6; i++) fireEvent.click(within(files).getByRole("button", { name: "Add file" }));
    expect(within(files).getAllByLabelText("File label")).toHaveLength(6);
    expect((within(files).getByRole("button", { name: "Add file" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Edit pre-fills and calls updateItem", async () => {
    view();
    menu("Beta sheet", "Edit");
    const d = screen.getByRole("dialog", { name: "Edit link" });
    expect((within(d).getByLabelText("Title") as HTMLInputElement).value).toBe("Beta sheet");
    expect((within(d).getByLabelText("Brand") as HTMLSelectElement).value).toBe("b1");
    fireEvent.change(within(d).getByLabelText("Title"), { target: { value: "Beta 2" } });
    fireEvent.click(within(d).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(A.updateItem).toHaveBeenCalledWith("r2", {
      title: "Beta 2", url: "https://example.com/x", description: null, categoryId: "c1", brandId: "b1", pinned: false, files: [],
    }));
  });

  it("Pin and Move call the actions; ends are disabled", async () => {
    view();
    menu("Alpha deck", "Pin");
    await waitFor(() => expect(A.setPinned).toHaveBeenCalledWith("r1", true));
    fireEvent.click(screen.getByRole("button", { name: "Actions for Alpha deck" }));
    expect((screen.getByRole("menuitem", { name: "Move up" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Move down" }));
    await waitFor(() => expect(A.moveItem).toHaveBeenCalledWith("r1", "down"));
  });

  it("shows Something went wrong when a pin action rejects", async () => {
    A.setPinned.mockRejectedValueOnce(new Error("boom"));
    view();
    menu("Alpha deck", "Pin");
    expect(await screen.findByText("Something went wrong. Try again.")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rows in the Pinned strip have no Move up/down", () => {
    view({ rows: [row({ id: "r1", title: "Alpha deck", pinned: true }), row({ id: "r3", title: "Gamma", sortOrder: 1 })] });
    const trigger = screen.getAllByRole("button", { name: "Actions for Alpha deck" });
    expect(trigger).toHaveLength(2);
    fireEvent.click(trigger[0]);
    expect(screen.queryByRole("menuitem", { name: "Move up" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Move down" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Unpin" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
    fireEvent.click(trigger[1]);
    expect(screen.getAllByRole("menuitem", { name: "Move down" })).toHaveLength(1);
  });

  it("Delete asks first and only deletes after confirming", async () => {
    view();
    menu("Alpha deck", "Delete");
    const d = screen.getByRole("dialog", { name: 'Delete "Alpha deck"?' });
    expect(A.deleteItem).not.toHaveBeenCalled();
    fireEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    expect(A.deleteItem).not.toHaveBeenCalled();
    menu("Alpha deck", "Delete");
    fireEvent.click(within(screen.getByRole("dialog", { name: 'Delete "Alpha deck"?' })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(A.deleteItem).toHaveBeenCalledWith("r1"));
  });

  it("Categories dialog renames, adds, moves and shows the not-empty message", async () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Manage categories" }));
    const d = screen.getByRole("dialog", { name: "Manage categories" });
    fireEvent.change(within(d).getByLabelText("Name of Master Box Size"), { target: { value: "Boxes" } });
    fireEvent.click(within(d).getAllByRole("button", { name: "Save" })[1]);
    await waitFor(() => expect(A.updateCategory).toHaveBeenCalledWith("c2", { name: "Boxes", icon: "box" }));
    fireEvent.change(within(d).getByLabelText("New category name"), { target: { value: " Extras " } });
    fireEvent.click(within(d).getByRole("button", { name: "Add category" }));
    await waitFor(() => expect(A.createCategory).toHaveBeenCalledWith({ name: "Extras", icon: null }));
    fireEvent.click(within(d).getByRole("button", { name: "Move Product Knowledge down" }));
    await waitFor(() => expect(A.moveCategory).toHaveBeenCalledWith("c1", "down"));
    A.deleteCategory.mockResolvedValue({ ok: false, code: "CATEGORY_NOT_EMPTY", message: "Move or delete its links first" });
    fireEvent.click(within(d).getByRole("button", { name: "Delete Product Knowledge" }));
    expect(await within(d).findByText("Move or delete its links first")).toBeTruthy();
  });

  it("empty category offers Add the first link with the category preselected", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Add the first link" }));
    expect((within(screen.getByRole("dialog", { name: "Add link" })).getByLabelText("Category") as HTMLSelectElement).value).toBe("c2");
  });

  it("with no categories editors are pointed to Manage categories", () => {
    view({ rows: [], categories: [] });
    expect(screen.getByText("No categories yet")).toBeTruthy();
  });

  it("keeps the typed category name when adding fails", async () => {
    A.createCategory.mockResolvedValue({ ok: false, code: "VALIDATION", message: "Already exists" });
    view();
    fireEvent.click(screen.getByRole("button", { name: "Manage categories" }));
    const d = screen.getByRole("dialog", { name: "Manage categories" });
    fireEvent.change(within(d).getByLabelText("New category name"), { target: { value: "Dup" } });
    fireEvent.click(within(d).getByRole("button", { name: "Add category" }));
    expect(await within(d).findByText("Already exists")).toBeTruthy();
    expect((within(d).getByLabelText("New category name") as HTMLInputElement).value).toBe("Dup");
  });

  it("disables category controls while a call is in flight", async () => {
    let done!: (v: unknown) => void;
    A.moveCategory.mockReturnValue(new Promise((r) => { done = r; }));
    view();
    fireEvent.click(screen.getByRole("button", { name: "Manage categories" }));
    const d = screen.getByRole("dialog", { name: "Manage categories" });
    fireEvent.click(within(d).getByRole("button", { name: "Move Product Knowledge down" }));
    await waitFor(() => expect((within(d).getByRole("button", { name: "Delete Master Box Size" }) as HTMLButtonElement).disabled).toBe(true));
    expect((within(d).getByRole("button", { name: "Move Product Knowledge down" }) as HTMLButtonElement).disabled).toBe(true);
    done({ ok: true });
    await waitFor(() => expect((within(d).getByRole("button", { name: "Delete Master Box Size" }) as HTMLButtonElement).disabled).toBe(false));
    expect(A.moveCategory).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the opener when a dialog closes", () => {
    view();
    const add = screen.getByRole("button", { name: "Add link" });
    add.focus();
    fireEvent.click(add);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Add link" })).getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(add);
    // From the row menu the item unmounts, so focus goes to the row's Actions trigger.
    menu("Alpha deck", "Delete");
    fireEvent.click(within(screen.getByRole("dialog", { name: 'Delete "Alpha deck"?' })).getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Actions for Alpha deck" }));
  });

  it("recovers when an action rejects", async () => {
    A.moveCategory.mockRejectedValueOnce(new Error("network"));
    A.deleteItem.mockRejectedValueOnce(new Error("network"));
    A.createItem.mockRejectedValueOnce(new Error("network"));
    view();
    fireEvent.click(screen.getByRole("button", { name: "Manage categories" }));
    const d = screen.getByRole("dialog", { name: "Manage categories" });
    fireEvent.click(within(d).getByRole("button", { name: "Move Product Knowledge down" }));
    expect(await within(d).findByText("Something went wrong. Try again.")).toBeTruthy();
    expect((within(d).getByRole("button", { name: "Delete Master Box Size" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(d).getByRole("button", { name: "Close" }));

    menu("Alpha deck", "Delete");
    const del = screen.getByRole("dialog", { name: 'Delete "Alpha deck"?' });
    fireEvent.click(within(del).getByRole("button", { name: "Delete" }));
    expect(await within(del).findByText("Something went wrong. Try again.")).toBeTruthy();
    expect((within(del).getByRole("button", { name: "Delete" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(del).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    const add = screen.getByRole("dialog", { name: "Add link" });
    fireEvent.change(within(add).getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.click(within(add).getByRole("button", { name: "Add link" }));
    expect(await within(add).findByText("Something went wrong. Try again.")).toBeTruthy();
    expect((within(add).getByRole("button", { name: "Add link" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
