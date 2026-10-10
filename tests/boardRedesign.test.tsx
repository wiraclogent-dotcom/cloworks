// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within, act, fireEvent } from "@testing-library/react";

vi.mock("@/app/(app)/requests/actions", () => ({ moveRequest: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
let dnd: { onDragStart?: (e: unknown) => void; onDragCancel?: () => void } = {};
vi.mock("@dnd-kit/core", async (orig) => {
  const m = await orig<typeof import("@dnd-kit/core")>();
  return { ...m, DndContext: (props: React.ComponentProps<typeof m.DndContext>) => { dnd = props as typeof dnd; return <m.DndContext {...props} />; } };
});

import { DndContext } from "@dnd-kit/core";
import { Board, type BoardColumnView } from "@/components/Board";
import { BoardCard } from "@/components/BoardCard";
import { DoneDialog } from "@/components/DoneDialog";
import { FilterBar } from "@/components/FilterBar";
import { parseParams } from "@/app/(app)/requests/params";
import { BOARD_STATUSES } from "@/components/status";
import type { RequestRow } from "@/lib/requests";

afterEach(cleanup);

const row = (extra: Partial<RequestRow> = {}): RequestRow => ({
  id: "c1", title: "Banner", status: "REQUESTED", brandName: "Clogent", divisionName: "Marketing", requesterName: "Rina Sari", assigneeName: "Cami",
  requestedAt: new Date("2026-10-01T00:00:00Z"), deadline: null, outputCount: 1, daysLeft: 5, needsMotion: false, ...extra,
});
const card = (extra: Partial<RequestRow> = {}, canMove = false) =>
  render(<DndContext><ul><BoardCard card={row(extra)} canMove={canMove} busy={false} dragging={false} /></ul></DndContext>);
const chips = () => document.querySelector("[data-card-chips]") as HTMLElement;

describe("board card chips", () => {
  it("shows the brand as a coloured tag chip", () => {
    card();
    const tag = within(chips()).getByText("Clogent");
    expect(tag.getAttribute("data-tone")).toBe("tag-clogent");
    expect(within(chips()).getByText("Marketing")).toBeTruthy();
  });

  it("shows the Needs motion chip only when the request needs motion", () => {
    card({ needsMotion: false });
    expect(within(chips()).queryByText("Needs motion")).toBeNull();
    cleanup();
    card({ needsMotion: true });
    expect(within(chips()).getByText("Needs motion").closest("[data-tone]")!.getAttribute("data-tone")).toBe("needs-motion");
  });

  it.each([
    [-3, "Overdue by 3 days", "overdue"],
    [1, "1 day left", "due-soon"],
    [0, "Due today", "due-soon"],
    [9, "9 days left", "on-track"],
    [null, "No deadline", "none"],
  ] as const)("deadline chip for daysLeft=%s reads %s", (days, text, state) => {
    card({ daysLeft: days });
    const chip = within(chips()).getByText(text);
    expect(chip.getAttribute("data-deadline")).toBe(state);
  });

  it("hides the deadline chip for finished requests", () => {
    card({ status: "DONE", daysLeft: -4 });
    expect(chips().querySelector("[data-deadline]")).toBeNull();
    cleanup();
    card({ status: "CANCELLED", daysLeft: 2 });
    expect(chips().querySelector("[data-deadline]")).toBeNull();
  });

  it("shows the assignee avatar with an accessible name, or the unassigned avatar", () => {
    card({ assigneeName: "Cami Putri" });
    const a = screen.getByRole("img", { name: "Assignee: Cami Putri" });
    expect(a.getAttribute("title")).toBe("Assignee: Cami Putri");
    expect(a.getAttribute("data-card-assignee")).toBe("assigned");
    expect(a.textContent).toBe("CP");
    cleanup();
    card({ assigneeName: null });
    const u = screen.getByRole("img", { name: "Assignee: Unassigned" });
    expect(u.getAttribute("data-card-assignee")).toBe("unassigned");
    expect(u.querySelector("svg")).toBeTruthy();
  });

  it("shows the requester name with a small avatar and keeps the title link the only interactive element for read-only users", () => {
    card();
    expect(screen.getByTitle("Requester: Rina Sari").textContent).toContain("Rina Sari");
    const li = document.querySelector("[data-card]") as HTMLElement;
    expect(li.querySelectorAll("a, button, input, select, textarea").length).toBe(1);
    expect(screen.getByRole("link", { name: "Banner" })).toBeTruthy();
  });

  it("movers get the title link plus the drag handle (hidden until hover/focus, always on touch)", () => {
    card({}, true);
    const handle = screen.getByRole("button", { name: /drag “Banner”/i });
    expect(handle.className).toMatch(/opacity-0/);
    expect(handle.className).toMatch(/group-focus-within\/card:opacity-100/);
    expect(handle.className).toMatch(/focus-visible:opacity-100/);
    const li = document.querySelector("[data-card]") as HTMLElement;
    expect(li.className).toMatch(/rounded-xl/);
    expect(li.className).toMatch(/hover:-translate-y-px/);
    expect(li.className).not.toMatch(/#[0-9a-f]{6}/i);
  });
});

function columns(rs: RequestRow[]): BoardColumnView[] {
  return BOARD_STATUSES.map((status) => {
    const inCol = rs.filter((r) => r.status === status);
    return { status, total: inCol.length, rows: inCol, moreHref: null, tableHref: `/requests?view=table&status=${status}` };
  });
}

describe("board columns", () => {
  it("each column header carries its status tone (accent bar + tint) and a count pill", () => {
    render(<Board columns={columns([row()])} canMove={false} />);
    const tones = BOARD_STATUSES.map((s) => screen.getByRole("region", { name: new RegExp(`^${s === "ON_PROGRESS" ? "On progress" : s === "FIRST_LOOK" ? "First look" : s === "DONE" ? "Done" : "Requested"}`) }).getAttribute("data-tone"));
    expect(tones).toEqual(["requested", "in-progress", "first-look", "done"]);
    const header = document.querySelector("#col-REQUESTED") as HTMLElement;
    expect(header.className).toMatch(/rounded-full/);
    expect(header.className).toMatch(/bg-tone-tint/);
    expect(header.querySelector("svg[aria-hidden]")).toBeTruthy();
  });

  it("marks valid drop targets with a dashed outline and text, invalid ones dimmed with text", () => {
    render(<Board columns={columns([row({ id: "x", status: "FIRST_LOOK" })])} canMove={true} />);
    act(() => { dnd.onDragStart?.({ active: { id: "x" } }); });
    const done = screen.getByRole("region", { name: /^Done/ });
    expect(done.getAttribute("data-drop")).toBe("valid");
    expect(done.className).toMatch(/outline-dashed/);
    expect(done.className).toMatch(/outline-ring/);
    const req = screen.getByRole("region", { name: /^Requested/ });
    expect(req.getAttribute("data-drop")).toBe("invalid");
    expect(req.className).toMatch(/opacity-60/);
    expect(within(req).getByText("Not a valid move")).toBeTruthy();
    expect(within(done).getByText("Drop to move to Done")).toBeTruthy();
    act(() => { dnd.onDragCancel?.(); });
    expect(done.getAttribute("data-drop")).toBeNull();
  });

  it("empty columns show a dashed placeholder with an icon", () => {
    render(<Board columns={columns([])} canMove={false} />);
    const ph = within(screen.getByRole("region", { name: /^Done/ })).getByText("No requests here").parentElement!;
    expect(ph.className).toMatch(/border-dashed/);
    expect(ph.querySelector("svg[aria-hidden]")).toBeTruthy();
  });
});

describe("Done dialog (restyled)", () => {
  // Regression: inside the request side panel (a native <dialog>), an Escape that was only stopPropagation'd still
  // fired the panel's cancel event, so one Escape closed the Done dialog and the whole panel.
  it("Escape cancels only this dialog: it claims the key so an enclosing <dialog> does not close too", () => {
    const onCancel = vi.fn();
    render(<DoneDialog title="Poster" onCancel={onCancel} onSubmit={() => {}} />);
    const notCanceled = fireEvent.keyDown(screen.getByLabelText(/Number of outputs/), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(notCanceled).toBe(false); // preventDefault was called
  });

  it("keeps the labelled modal, kit fields and buttons, and inline errors with an icon", () => {
    render(<DoneDialog title="Poster" onCancel={() => {}} onSubmit={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Mark as done" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.className).toMatch(/rounded-xl/);
    expect(dialog.className).toMatch(/shadow-raised/);
    expect(dialog.parentElement!.className).toMatch(/bg-\[var\(--backdrop\)\]/);
    expect(screen.getByRole("button", { name: "Cancel" }).className).toMatch(/hover:bg-surface-muted/);
    expect(screen.getByRole("button", { name: "Mark as done" }).className).toMatch(/bg-primary/);
    const count = screen.getByLabelText(/Number of outputs/);
    expect(document.activeElement).toBe(count);
    fireEvent.change(count, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark as done" }));
    const err = screen.getByText(/whole number from 1 to 1000/i).closest("p")!;
    expect(count.getAttribute("aria-describedby")).toBe(err.id);
    expect(count.getAttribute("aria-invalid")).toBe("true");
    expect(err.querySelector("svg[aria-hidden]")).toBeTruthy();
  });
});


describe("filter pills", () => {
  it("renders pill fields, Apply as the primary button and Clear filters as a ghost link; active filters are tinted", () => {
    render(<FilterBar p={parseParams({ motion: "yes", status: "DONE" })} brands={[]} divisions={[]} assignees={[]} mineHref="/m" clearHref="/c" />);
    const motion = screen.getByLabelText("Motion");
    expect(motion.className).toMatch(/rounded-full/);
    expect(motion.className).toMatch(/bg-accent/);
    expect(motion.className).not.toMatch(/bg-surface\b/);
    const brand = screen.getByLabelText("Brand");
    expect(brand.className).toMatch(/bg-surface/);
    expect(brand.className).not.toMatch(/bg-accent/);
    expect(screen.getByLabelText("Status").className).toMatch(/bg-accent/);
    expect(screen.getByRole("button", { name: "Apply" }).className).toMatch(/bg-primary/);
    const clear = screen.getByRole("link", { name: "Clear filters" });
    expect(clear.getAttribute("href")).toBe("/c");
    expect(clear.className).not.toMatch(/bg-primary/);
    expect(screen.getByRole("link", { name: "My requests" }).className).toMatch(/rounded-full/);
  });
});
