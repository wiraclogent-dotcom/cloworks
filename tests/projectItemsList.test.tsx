// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act, within } from "@testing-library/react";
import type { ProjectStage } from "@prisma/client";

const setItemStage = vi.fn();
const setItemStatus = vi.fn();
const renameItem = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(app)/projects/[id]/tasks/actions", () => ({
  setItemStage: (...a: unknown[]) => setItemStage(...a),
  setItemStatus: (...a: unknown[]) => setItemStatus(...a),
  renameItem: (...a: unknown[]) => renameItem(...a),
  setTaskDetail: vi.fn(), setTaskDate: vi.fn(), setTaskStage: vi.fn(), setTaskStatus: vi.fn(),
  setTaskFileUrl: vi.fn(), deleteTask: vi.fn(), moveTask: vi.fn(), createTaskDetail: vi.fn(),
}));

import { groupItems, type ItemRowInput } from "@/lib/projectItemList";
import type { TaskRowData } from "@/app/(app)/projects/[id]/tasks/TaskRow";
import { ProjectItemsList } from "@/components/projects/ProjectItemsList";
import { ProjectItemRow } from "@/components/projects/ProjectItemRow";
import { ItemHashOpener } from "@/components/projects/ItemHashOpener";
import { NeedsAttention } from "@/components/projects/NeedsAttention";

class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  setItemStage.mockReset(); setItemStatus.mockReset(); renameItem.mockReset(); refresh.mockReset();
  window.location.hash = "";
});
afterEach(cleanup);

const dayFromNow = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function make(title: string, variants: { sub: string; owner: string | null; stage: ProjectStage | null }[], due: Date | null = dayFromNow(10)) {
  const inputs: ItemRowInput[] = variants.map((v, i) => ({
    id: `${title}-${i}`, title, subTitle: v.sub, position: i + 1, ownerId: v.owner ? `u-${v.owner}` : null,
    ownerName: v.owner, stage: v.stage, status: null, startDate: null, dueDate: due, dueTbc: false,
  }));
  const data: TaskRowData[] = inputs.map((r) => ({
    id: r.id, title: r.title, subTitle: r.subTitle, ownerId: r.ownerId, ownerName: r.ownerName, stage: r.stage, status: null,
    startIso: null, dueIso: r.dueDate ? iso(r.dueDate) : null, dueTbc: false, fileName: null, fileUrl: null, notes: null,
  }));
  return { inputs, data };
}

const pods = make("Laundry Pods Regular 4", [
  { sub: "Front", owner: "Dewi Lestari", stage: "APPROVAL" },
  { sub: "Back", owner: "Budi Santoso", stage: "APPROVAL" },
  { sub: "Side", owner: "Dewi Lestari", stage: "FINAL_ARTWORK" },
]);
const [podsItem] = groupItems(pods.inputs, "stage");

function renderRow(canManage: boolean) {
  return render(<ProjectItemRow projectId="p1" item={podsItem} rows={pods.data} mode="stage" owners={[{ id: "u1", name: "Dewi Lestari" }]} canManage={canManage} />);
}

describe("ProjectItemRow", () => {
  it("collapsed: title, variant count, avatars and the due chip; no task rows yet", () => {
    const { container } = renderRow(false);
    const btn = screen.getByRole("button", { name: "Laundry Pods Regular 4, 3 variants" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Laundry Pods Regular 4")).toBeTruthy();
    expect(screen.getByText("3 variants")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Owners: Dewi Lestari, Budi Santoso" })).toBeTruthy();
    expect(container.querySelector("[data-deadline]")).toBeTruthy();
    expect(container.querySelector("tr")).toBeNull();
    expect(container.querySelector("#item-laundry-pods-regular-4")).toBeTruthy();
  });

  it("stage bar has a segment per stage with sr-only counts", () => {
    const { container } = renderRow(false);
    const segs = [...container.querySelectorAll<HTMLElement>("[data-segment]")];
    expect(segs.map((s) => s.getAttribute("data-segment"))).toEqual(["APPROVAL", "FINAL_ARTWORK"]);
    expect(segs[1].getAttribute("data-tone")).toBe("done");
    expect(screen.getByText("Approval: 2")).toBeTruthy();
    expect(screen.getByText("Final Artwork: 1")).toBeTruthy();
  });

  it("shows TBC when the item has no date", () => {
    const tbc = make("Box", [{ sub: "A", owner: null, stage: null }], null);
    const [item] = groupItems(tbc.inputs.map((r) => ({ ...r, dueTbc: true })), "stage");
    render(<ProjectItemRow projectId="p1" item={item} rows={tbc.data} mode="stage" owners={[]} canManage={false} />);
    expect(screen.getByText("TBC")).toBeTruthy();
  });

  it("expands on click into one TaskRow per variant without an Item cell", () => {
    const { container } = renderRow(false);
    fireEvent.click(screen.getByRole("button", { name: "Laundry Pods Regular 4, 3 variants" }));
    expect(screen.getByRole("button", { name: "Laundry Pods Regular 4, 3 variants" }).getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("#item-laundry-pods-regular-4")?.hasAttribute("data-open")).toBe(true);
    const body = container.querySelectorAll("tbody tr");
    expect(body).toHaveLength(3);
    expect(within(container.querySelector("thead") as HTMLElement).queryByText("Item")).toBeNull();
    expect(body[0].querySelectorAll("td")).toHaveLength(6);
    expect(screen.getByText("Front")).toBeTruthy();
  });

  it("move up is disabled on the first variant and move down on the last, within the item", () => {
    renderRow(true);
    fireEvent.click(screen.getByRole("button", { name: "Laundry Pods Regular 4, 3 variants" }));
    for (const b of screen.getAllByRole("button", { name: /^Edit Laundry Pods Regular 4/ })) fireEvent.click(b);
    const up = screen.getAllByRole("button", { name: /^Move .* up$/ }) as HTMLButtonElement[];
    const down = screen.getAllByRole("button", { name: /^Move .* down$/ }) as HTMLButtonElement[];
    expect(up.map((b) => b.disabled)).toEqual([true, false, false]);
    expect(down.map((b) => b.disabled)).toEqual([false, false, true]);
  });

  const choose = (title: string, value: string) =>
    fireEvent.change(screen.getByLabelText(`Set all variants of ${title}`), { target: { value } });
  const apply = (title: string) => screen.getByRole("button", { name: `Apply to all variants of ${title}` }) as HTMLButtonElement;

  it("Set all does nothing on change; Apply stays disabled until a value is chosen", () => {
    renderRow(true);
    expect(apply("Laundry Pods Regular 4").disabled).toBe(true);
    choose("Laundry Pods Regular 4", "APPROVAL");
    expect(setItemStage).not.toHaveBeenCalled();
    expect(apply("Laundry Pods Regular 4").disabled).toBe(false);
  });

  it("Apply calls setItemStage, refreshes, resets the select and keeps focus on it", async () => {
    setItemStage.mockResolvedValue({ ok: true, changed: 3 });
    renderRow(true);
    const select = screen.getByLabelText("Set all variants of Laundry Pods Regular 4") as HTMLSelectElement;
    expect(select.value).toBe("");
    choose("Laundry Pods Regular 4", "APPROVAL");
    await act(async () => { fireEvent.click(apply("Laundry Pods Regular 4")); });
    expect(setItemStage).toHaveBeenCalledWith("p1", "Laundry Pods Regular 4", "APPROVAL");
    expect(refresh).toHaveBeenCalled();
    expect(select.value).toBe("");
    expect(document.activeElement).toBe(select);
    expect(apply("Laundry Pods Regular 4").disabled).toBe(true);
  });

  it("Apply shows the refusal and does not refresh", async () => {
    setItemStage.mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "You are not allowed to change task stages." });
    renderRow(true);
    choose("Laundry Pods Regular 4", "APPROVAL");
    await act(async () => { fireEvent.click(apply("Laundry Pods Regular 4")); });
    expect((await screen.findByRole("alert")).textContent).toMatch(/not allowed/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("status mode applies a status to the whole item", async () => {
    setItemStatus.mockResolvedValue({ ok: true, changed: 1 });
    render(<ProjectItemRow projectId="p1" item={podsItem} rows={pods.data} mode="status" owners={[]} canManage />);
    choose("Laundry Pods Regular 4", "DONE");
    await act(async () => { fireEvent.click(apply("Laundry Pods Regular 4")); });
    expect(setItemStatus).toHaveBeenCalledWith("p1", "Laundry Pods Regular 4", "DONE");
  });

  it("renames the item inline: Save calls renameItem and refreshes", async () => {
    renameItem.mockResolvedValue({ ok: true });
    renderRow(true);
    fireEvent.click(screen.getByRole("button", { name: "Rename item Laundry Pods Regular 4" }));
    const box = screen.getByLabelText("New name for Laundry Pods Regular 4") as HTMLInputElement;
    expect(box.value).toBe("Laundry Pods Regular 4");
    fireEvent.change(box, { target: { value: "  Pods Mini  " } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect(renameItem).toHaveBeenCalledWith("p1", "Laundry Pods Regular 4", "  Pods Mini  ");
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByLabelText("New name for Laundry Pods Regular 4")).toBeNull();
  });

  it("a refused rename shows why and keeps the editor open; Cancel closes it", async () => {
    renameItem.mockResolvedValue({ ok: false, code: "VALIDATION", message: "Another item already has this name." });
    renderRow(true);
    fireEvent.click(screen.getByRole("button", { name: "Rename item Laundry Pods Regular 4" }));
    fireEvent.change(screen.getByLabelText("New name for Laundry Pods Regular 4"), { target: { value: "Box" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
    expect((await screen.findByRole("alert")).textContent).toMatch(/already has this name/);
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("New name for Laundry Pods Regular 4")).toBeNull();
    expect(renameItem).toHaveBeenCalledTimes(1);
  });

  it("read-only has no rename button", () => {
    renderRow(false);
    expect(screen.queryByRole("button", { name: /^Rename item/ })).toBeNull();
  });

  it("offers Add variant prefilled with the item title when managing", () => {
    renderRow(true);
    fireEvent.click(screen.getByRole("button", { name: "Laundry Pods Regular 4, 3 variants" }));
    fireEvent.click(screen.getByRole("button", { name: "Add variant" }));
    expect((screen.getByLabelText("Item") as HTMLInputElement).value).toBe("Laundry Pods Regular 4");
  });

  it("read-only: no set-all select, no add buttons, no inline editor buttons", () => {
    renderRow(false);
    fireEvent.click(screen.getByRole("button", { name: "Laundry Pods Regular 4, 3 variants" }));
    expect(screen.queryByLabelText(/^Set all variants of/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Apply to all/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add variant|Add item/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("opens itself and scrolls on project-item-open for its slug, ignoring others", () => {
    const { container } = renderRow(false);
    const scroll = window.HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    act(() => { window.dispatchEvent(new CustomEvent("project-item-open", { detail: { slug: "other" } })); });
    expect(container.querySelector("tr")).toBeNull();
    act(() => { window.dispatchEvent(new CustomEvent("project-item-open", { detail: { slug: "laundry-pods-regular-4" } })); });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(scroll).toHaveBeenCalledWith({ block: "start" });
  });
});

describe("deep links", () => {
  it("a row opens itself on mount when the hash names it", () => {
    window.location.hash = "#item-laundry-pods-regular-4";
    const { container } = renderRow(false);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("a row for another slug stays closed when the hash names a different item", () => {
    window.location.hash = "#item-box";
    const { container } = renderRow(false);
    expect(container.querySelector("tr")).toBeNull();
  });

  it("clicking a Needs attention link asks the row to open, every time", () => {
    const seen: string[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent<{ slug: string }>).detail.slug);
    window.addEventListener("project-item-open", on);
    const late = make("Late", [{ sub: "A", owner: null, stage: "APPROVAL" }], dayFromNow(-3));
    render(<NeedsAttention items={groupItems(late.inputs, "stage")} now={new Date()} />);
    const link = screen.getByRole("link", { name: "Late" });
    expect(link.getAttribute("href")).toBe("#item-late");
    fireEvent.click(link);
    fireEvent.click(link);
    expect(seen).toEqual(["late", "late"]);
    window.removeEventListener("project-item-open", on);
  });
});

describe("ProjectItemsList", () => {
  it("the second item's first variant cannot move up (within-item bounds)", () => {
    const other = make("Box", [{ sub: "A", owner: null, stage: null }, { sub: "B", owner: null, stage: null }]);
    const items = groupItems([...pods.inputs, ...other.inputs.map((r) => ({ ...r, position: 10 + r.position }))], "stage");
    const rowsData = new Map([...pods.data, ...other.data].map((d) => [d.id, d]));
    render(<ProjectItemsList projectId="p1" items={items} rowsData={rowsData} mode="stage" owners={[]} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Box, 2 variants" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Box A" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit Box B" }));
    expect((screen.getByRole("button", { name: "Move Box A up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Move Box B up" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Move Box B down" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("renders a row per item plus Add item when managing", () => {
    const other = make("Box", [{ sub: "A", owner: null, stage: null }]);
    const items = groupItems([...pods.inputs, ...other.inputs.map((r) => ({ ...r, position: 10 }))], "stage");
    const rowsData = new Map([...pods.data, ...other.data].map((d) => [d.id, d]));
    render(<ProjectItemsList projectId="p1" items={items} rowsData={rowsData} mode="stage" owners={[]} canManage />);
    expect(screen.getByRole("button", { name: "Laundry Pods Regular 4, 3 variants" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Box, 1 variant" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect((screen.getByLabelText("Item") as HTMLInputElement).value).toBe("");
  });

  it("read-only list has no Add item", () => {
    const rowsData = new Map(pods.data.map((d) => [d.id, d]));
    render(<ProjectItemsList projectId="p1" items={[podsItem]} rowsData={rowsData} mode="stage" owners={[]} canManage={false} />);
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
  });

  it("an empty list says No items yet", () => {
    render(<ProjectItemsList projectId="p1" items={[]} rowsData={new Map()} mode="stage" owners={[]} canManage={false} />);
    expect(screen.getByText("No items yet")).toBeTruthy();
  });
});

describe("ItemHashOpener", () => {
  it("dispatches project-item-open for an #item- hash on mount and on hashchange", () => {
    const seen: string[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent<{ slug: string }>).detail.slug);
    window.addEventListener("project-item-open", on);
    window.location.hash = "#item-box";
    render(<ItemHashOpener />);
    expect(seen).toEqual(["box"]);
    window.location.hash = "#item-pods-2";
    act(() => { window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(seen).toEqual(["box", "pods-2"]);
    window.location.hash = "#timeline";
    act(() => { window.dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(seen).toEqual(["box", "pods-2"]);
    window.removeEventListener("project-item-open", on);
  });

  it("falls back to the raw slug when the hash is not valid percent-encoding", () => {
    const seen: string[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent<{ slug: string }>).detail.slug);
    window.addEventListener("project-item-open", on);
    window.location.hash = "#item-100%";
    expect(() => render(<ItemHashOpener />)).not.toThrow();
    expect(seen).toEqual(["100%"]);
    window.removeEventListener("project-item-open", on);
  });
});
