// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within, act } from "@testing-library/react";

const move = vi.fn();
vi.mock("@/app/(app)/requests/actions", () => ({ moveRequest: (...a: unknown[]) => move(...a) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// Drag events are hard to simulate in jsdom (no layout, so no droppable rects): capture the DndContext
// props and call onDragEnd directly, which is the same single code path a real drop takes.
let dnd: { onDragEnd?: (e: unknown) => void; onDragStart?: (e: unknown) => void; onDragCancel?: () => void } = {};
vi.mock("@dnd-kit/core", async (orig) => {
  const m = await orig<typeof import("@dnd-kit/core")>();
  return { ...m, DndContext: (props: React.ComponentProps<typeof m.DndContext>) => { dnd = props as typeof dnd; return <m.DndContext {...props} />; } };
});

import { renderToString } from "react-dom/server";
import { Board, type BoardColumnView } from "@/components/Board";
import { BOARD_STATUSES } from "@/components/status";
import type { RequestRow } from "@/lib/requests";

const row = (id: string, title: string, status: RequestRow["status"], extra: Partial<RequestRow> = {}): RequestRow => ({
  id, title, status, brandName: "BrandA", divisionName: "DivX", requesterName: "Rina", assigneeName: "Cami",
  requestedAt: new Date("2026-10-01T00:00:00Z"), deadline: null, outputCount: 1, daysLeft: null, ...extra,
});
const rows = [row("1", "Banner", "FIRST_LOOK"), row("2", "Poster", "REQUESTED", { assigneeName: null })];

/** Builds the per-column server data the page passes in; totals default to the rows given. */
function columns(rs: RequestRow[], totals: Partial<Record<RequestRow["status"], number>> = {}, cancelled = false): BoardColumnView[] {
  const statuses = cancelled ? [...BOARD_STATUSES, "CANCELLED" as const] : BOARD_STATUSES;
  return statuses.map((status) => {
    const inCol = rs.filter((r) => r.status === status);
    const total = totals[status] ?? inCol.length;
    return { status, total, rows: inCol, moreHref: total > inCol.length ? `/requests?more=${status}%3A50` : null, tableHref: `/requests?view=table&status=${status}` };
  });
}
const view = (rs = rows, canMove = true, totals = {}) => render(<Board columns={columns(rs, totals)} canMove={canMove} />);
/** A drop of card `id` on column `to`, the way dnd-kit reports it. */
const drop = (id: string, to: string) => act(() => { dnd.onDragEnd?.({ active: { id }, over: { id: to } }); });

beforeEach(() => { move.mockReset(); refresh.mockReset(); });
afterEach(cleanup);

const column = (name: string) => screen.getByRole("region", { name: new RegExp(`^${name}`) });

describe("Board", () => {
  it("renders a column per status in workflow order with cards in the right column", () => {
    view(rows, false);
    const heads = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(heads.map((h) => h!.replace(/\d+$/, "").trim())).toEqual(["Requested", "On progress", "First look", "Done"]);
    expect(within(column("First look")).getByText("Banner")).toBeTruthy();
    expect(within(column("Requested")).getByText("Poster")).toBeTruthy();
  });

  it("shows plain-language empty states", () => {
    view([], true);
    expect(screen.getAllByText(/nothing here yet/i).length).toBe(4);
  });

  it("is read-only for a requester: no drag handle, no draggable cards, no move menu", () => {
    view(rows, false);
    expect(screen.queryByLabelText(/^Move/)).toBeNull();
    expect(screen.queryByRole("button", { name: /drag/i })).toBeNull();
    expect(document.querySelectorAll("[data-draggable]").length).toBe(0);
  });

  it("has no Move to… select on any card (the dropdown was removed from board cards)", () => {
    view(rows, true);
    expect(document.querySelectorAll("select").length).toBe(0);
    expect(screen.queryByLabelText(/Move “/)).toBeNull();
    expect(screen.queryByText("Move to…")).toBeNull();
  });

  it("keeps a labelled keyboard drag handle for movers", () => {
    view(rows, true);
    expect(screen.getByRole("button", { name: /drag “Banner”/i })).toBeTruthy();
  });

  describe("totals, limits and show-more", () => {
    const many = Array.from({ length: 25 }, (_, i) => row(`d${i}`, `Done ${i}`, "DONE"));
    it("header shows the TOTAL, not the number rendered", () => {
      view(many, true, { DONE: 523 });
      expect(screen.getByRole("heading", { name: /^Done\s*523$/ })).toBeTruthy();
      expect(within(column("Done")).getAllByRole("listitem")).toHaveLength(25);
    });
    it("footer shows Showing X of Y, a no-JS Show 25 more link and an Open all in table link", () => {
      view(many, true, { DONE: 523 });
      const done = within(column("Done"));
      expect(done.getByText("Showing 25 of 523")).toBeTruthy();
      expect(done.getByRole("link", { name: "Show 25 more" }).getAttribute("href")).toBe("/requests?more=DONE%3A50");
      expect(done.getByRole("link", { name: /open all in table/i }).getAttribute("href")).toBe("/requests?view=table&status=DONE");
    });
    it("has no Show-more or table link when everything is already shown", () => {
      view(rows, true);
      const req = within(column("Requested"));
      expect(req.getByText("Showing 1 of 1")).toBeTruthy();
      expect(req.queryByRole("link", { name: /show .* more/i })).toBeNull();
      expect(req.queryByRole("link", { name: /open all in table/i })).toBeNull();
    });
    it("scrolls each column body independently without growing the page", () => {
      view(many, true, { DONE: 523 });
      const body = column("Done").querySelector("[data-column-body]") as HTMLElement;
      expect(body.className).toMatch(/overflow-y-auto/);
      expect(body.className).toMatch(/overscroll-contain/);
      expect(body.contains(column("Done").querySelector("h2"))).toBe(false);
      expect(column("Done").className).toMatch(/board-column/); // globals.css: max-height max(20rem, 100dvh - 16rem)
    });
  });

  it("moves a card optimistically, updating both totals, and refreshes on success", async () => {
    move.mockResolvedValue({ ok: true });
    view(rows, true, { REQUESTED: 40, ON_PROGRESS: 7 });
    drop("2", "ON_PROGRESS");
    expect(move).toHaveBeenCalledWith("2", "ON_PROGRESS", undefined);
    await waitFor(() => expect(within(column("On progress")).getByText("Poster")).toBeTruthy());
    expect(screen.getByRole("heading", { name: /^Requested\s*39$/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^On progress\s*8$/ })).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("puts a moved card at the TOP of the destination even if it is beyond that column's loaded rows", async () => {
    move.mockResolvedValue({ ok: true });
    const loaded = [row("9", "Existing", "ON_PROGRESS"), row("2", "Poster", "REQUESTED")];
    view(loaded, true, { ON_PROGRESS: 90 });
    drop("2", "ON_PROGRESS");
    await waitFor(() => expect(within(column("On progress")).getByText("Poster")).toBeTruthy());
    const titles = within(column("On progress")).getAllByRole("listitem").map((li) => li.querySelector("a")!.textContent);
    expect(titles).toEqual(["Poster", "Existing"]);
    expect(within(column("On progress")).getByText("Showing 2 of 91")).toBeTruthy();
  });

  it("drop on DONE opens a dialog and submits outputCount and designFolderUrl", async () => {
    move.mockResolvedValue({ ok: true });
    view();
    drop("1", "DONE");
    const dialog = screen.getByRole("dialog");
    expect(move).not.toHaveBeenCalled();
    const count = within(dialog).getByLabelText(/Number of outputs/) as HTMLInputElement;
    expect(count.value).toBe("1");
    fireEvent.change(count, { target: { value: "4" } });
    fireEvent.change(within(dialog).getByLabelText(/Design folder link/), { target: { value: "https://drive.example.com/f" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /mark as done/i }));
    await waitFor(() => expect(move).toHaveBeenCalledWith("1", "DONE", { outputCount: 4, designFolderUrl: "https://drive.example.com/f" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("validates the dialog and closes on Escape", () => {
    view();
    drop("1", "DONE");
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Number of outputs/), { target: { value: "0" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /mark as done/i }));
    expect(move).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/whole number from 1 to 1000/i)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Number of outputs/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/Design folder link/), { target: { value: "ftp://x" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /mark as done/i }));
    expect(within(dialog).getByText(/http\(s\) link/i)).toBeTruthy();
    expect(move).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("rejects an absurd or over-cap output count in the dialog without calling the server", () => {
    view();
    drop("1", "DONE");
    const dialog = screen.getByRole("dialog");
    for (const v of ["99999999999999999999", "1001", "12a", "-3", "1.5"]) {
      fireEvent.change(within(dialog).getByLabelText(/Number of outputs/), { target: { value: v } });
      fireEvent.click(within(dialog).getByRole("button", { name: /mark as done/i }));
      expect(within(dialog).getByText(/whole number from 1 to 1000/i)).toBeTruthy();
    }
    expect(move).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText(/Number of outputs/), { target: { value: "1000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /mark as done/i }));
    expect(move).toHaveBeenCalledWith("1", "DONE", { outputCount: 1000 });
  });

  it("shows the server message and keeps the card in its column when the move fails", async () => {
    move.mockResolvedValue({ ok: false, code: "INVALID", message: "Request needs an assignee before it can be marked Done" });
    view();
    drop("1", "DONE");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /mark as done/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/needs an assignee/));
    expect(within(column("First look")).getByText("Banner")).toBeTruthy();
    expect(within(column("Done")).queryByText("Banner")).toBeNull();
  });

  it("reverts an optimistic move (card and totals) when the server rejects it", async () => {
    move.mockResolvedValue({ ok: false, code: "CONFLICT", message: "Request status changed concurrently; reload and retry" });
    view(rows, true, { REQUESTED: 40 });
    drop("2", "ON_PROGRESS");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/concurrently/));
    expect(within(column("Requested")).getByText("Poster")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Requested\s*40$/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^On progress\s*0$/ })).toBeTruthy();
  });

  it("an illegal drop goes to the server and its human message is shown; nothing moves", async () => {
    move.mockResolvedValue({ ok: false, code: "INVALID", message: "A request cannot go from Requested to Done" });
    view();
    drop("2", "DONE");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("cannot go from Requested to Done"));
    expect(within(column("Requested")).getByText("Poster")).toBeTruthy();
  });

  it("a drop on the same column or outside any column does nothing", () => {
    view();
    drop("1", "FIRST_LOOK");
    act(() => { dnd.onDragEnd?.({ active: { id: "1" }, over: null }); });
    act(() => { dnd.onDragEnd?.({ active: { id: "1" }, over: { id: "not-a-column" } }); });
    expect(move).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("read-only users cannot move via the drop handler either", () => {
    view(rows, false);
    drop("1", "ON_PROGRESS");
    expect(move).not.toHaveBeenCalled();
  });

  it("renders a deterministic dnd aria-describedby id (no hydration mismatch)", () => {
    const ids = (html: string) => [...html.matchAll(/aria-describedby="([^"]*)"/g)].map((m) => m[1]);
    const first = ids(renderToString(<Board columns={columns(rows)} canMove={true} />));
    const second = ids(renderToString(<Board columns={columns(rows)} canMove={true} />));
    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(new Set(first)).toEqual(new Set(["request-board"]));
    view();
    expect(screen.getByRole("button", { name: /drag “Banner”/i }).getAttribute("aria-describedby")).toBe("request-board");
  });

  it("returns focus to the card after Escape closes the Done dialog", () => {
    view();
    drop("1", "DONE");
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement?.closest("[data-card]")?.getAttribute("data-card")).toBe("1");
  });

  it("returns focus to the moved card after a move completes", async () => {
    move.mockResolvedValue({ ok: true });
    view();
    drop("2", "ON_PROGRESS");
    await waitFor(() => expect(within(column("On progress")).getByText("Poster")).toBeTruthy());
    await waitFor(() => expect(document.activeElement?.closest("[data-card]")?.getAttribute("data-card")).toBe("2"));
  });

  it("does not open the dialog for an unassigned card dropped on Done: shows an inline message", () => {
    const r = [row("3", "Flyer", "FIRST_LOOK", { assigneeName: null })];
    view(r);
    drop("3", "DONE");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Assign someone before marking this request Done.");
    expect(move).not.toHaveBeenCalled();
  });

  it("highlights valid drop columns with a text label while dragging, and clears it afterwards", () => {
    view();
    expect(screen.queryByText(/drop to move to/i)).toBeNull();
    act(() => { dnd.onDragStart?.({ active: { id: "1" } }); });
    expect(within(column("On progress")).getByText("Drop to move to On progress")).toBeTruthy();
    expect(within(column("Done")).getByText("Drop to move to Done")).toBeTruthy();
    expect(within(column("First look")).queryByText(/drop to move to/i)).toBeNull();
    expect(within(column("Requested")).queryByText(/drop to move to/i)).toBeNull();
    act(() => { dnd.onDragCancel?.(); });
    expect(screen.queryByText(/drop to move to/i)).toBeNull();
  });
});
