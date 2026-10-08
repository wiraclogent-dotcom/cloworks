// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within, act } from "@testing-library/react";

const reschedule = vi.fn();
vi.mock("@/app/(app)/requests/actions", () => ({ rescheduleRequest: (...a: unknown[]) => reschedule(...a) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RequestCalendar } from "@/components/RequestCalendar";
import { CalendarSkeleton } from "@/components/RequestSkeletons";
import type { CalendarRow } from "@/lib/requests";

const TODAY = "2026-10-08"; // Thursday; the October grid runs Mon 28 Sep to Sun 1 Nov.

const row = (id: string, title: string, extra: Partial<CalendarRow> = {}): CalendarRow => ({
  id, title, status: "REQUESTED", brandName: "Clogent", divisionName: "DivX", requesterName: "Rina", assigneeName: "Cami",
  requestedAt: new Date("2026-10-01T03:00:00Z"), deadline: new Date("2026-10-13T17:00:00Z"), outputCount: 1, daysLeft: 6,
  needsMotion: false, requestDay: "2026-10-01", deadlineDay: "2026-10-14", ...extra,
});

const HREFS = { prevHref: "/requests?view=calendar&month=2026-09", nextHref: "/requests?view=calendar&month=2026-11", todayHref: "/requests?view=calendar" };
const view = (rows: CalendarRow[], canMove = true) =>
  render(<RequestCalendar rows={rows} month="2026-10" today={TODAY} canMove={canMove} {...HREFS} />);

const cell = (label: string) => screen.getByRole("region", { name: label });

/** jsdom has no layout: give every day cell a 100x100 slot in a 7-column grid and every card a box inside its cell. */
function mockLayout() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const box = (x: number, y: number, w: number, h: number) =>
      ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) }) as DOMRect;
    const day = this.closest("[data-day]");
    if (!day) return box(0, 0, 0, 0);
    const i = Array.from(document.querySelectorAll("[data-day]")).indexOf(day);
    const x = (i % 7) * 100, y = Math.floor(i / 7) * 100;
    return this === day ? box(x, y, 100, 100) : box(x + 10, y + 30, 80, 20);
  });
}

/** Keyboard drag the way a user does it: Space on the handle, the arrow keys, Space to drop. */
async function keyboardMove(title: string, keys: string[]) {
  const handle = screen.getByRole("button", { name: `Drag “${title}”` });
  handle.focus();
  act(() => { fireEvent.keyDown(handle, { code: "Space", key: " " }); });
  // dnd-kit attaches its document keydown listener on the next tick.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  for (const code of keys) act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { code, key: code }); });
  act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { code: "Space", key: " " }); });
}

function mockNarrow(narrow: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q === "(max-width: 639px)" ? narrow : false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  reschedule.mockReset();
  refresh.mockReset();
  mockNarrow(false);
  // jsdom has no showModal/close on <dialog>.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RequestCalendar", () => {
  it("renders the month heading, Monday-first weekday headers and the month navigation links", () => {
    view([row("1", "Banner")]);
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeTruthy();
    const weekdays = Array.from(document.querySelectorAll("[data-weekday]")).map((w) => w.textContent);
    expect(weekdays).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(screen.getByRole("link", { name: "Previous month" }).getAttribute("href")).toBe(HREFS.prevHref);
    expect(screen.getByRole("link", { name: "Next month" }).getAttribute("href")).toBe(HREFS.nextHref);
    expect(screen.getByRole("link", { name: "Today" }).getAttribute("href")).toBe(HREFS.todayHref);
    // Leading/trailing days of the neighbouring months are part of the grid.
    expect(cell("Monday 28 September")).toBeTruthy();
    expect(cell("Sunday 1 November")).toBeTruthy();
    expect(cell("Thursday 8 October").getAttribute("aria-current")).toBe("date");
  });

  it("shows 3 cards in a day and a +N more button that opens a dialog listing all of them", () => {
    const five = ["A", "B", "C", "D", "E"].map((t, i) => row(String(i + 1), `Poster ${t}`));
    view(five);
    const day = cell("Wednesday 14 October");
    expect(within(day).getAllByRole("link")).toHaveLength(3);
    const more = within(day).getByRole("button", { name: "2 more on Wednesday 14 October" });
    expect(more.textContent).toBe("+2 more");
    fireEvent.click(more);
    const dialog = screen.getByRole("dialog", { name: "Wednesday 14 October" });
    expect(within(dialog).getAllByRole("link").map((l) => l.textContent)).toEqual(five.map((r) => r.title));
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("puts a no-deadline card on today with a No deadline label and marks overdue cards with the overdue tone", () => {
    view([row("1", "Loose", { deadline: null, deadlineDay: null, daysLeft: null }), row("2", "Late", { deadlineDay: "2026-10-05", daysLeft: -3 }), row("3", "Fine")]);
    const today = cell("Thursday 8 October");
    expect(within(today).getByRole("link", { name: "Loose" })).toBeTruthy();
    expect(within(today).getByText("No deadline")).toBeTruthy();
    const late = document.querySelector('[data-card="2"]')!;
    expect(late.getAttribute("data-tone")).toBe("overdue");
    expect(within(late as HTMLElement).getByText("Overdue")).toBeTruthy();
    expect(document.querySelector('[data-card="3"]')!.getAttribute("data-tone")).toBe("tag-clogent");
    expect(within(cell("Monday 5 October")).getByRole("link", { name: "Late" }).getAttribute("href")).toBe("/requests/2");
  });

  it("keyboard: Space, ArrowRight, Space moves the card to the next day and refreshes", async () => {
    mockLayout();
    reschedule.mockResolvedValue({ ok: true });
    view([row("1", "Banner")]);
    await keyboardMove("Banner", ["ArrowRight"]);
    await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
    expect(reschedule).toHaveBeenCalledWith("1", "2026-10-15");
    expect(within(cell("Thursday 15 October")).getByRole("link", { name: "Banner" })).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("keyboard: ArrowDown moves a week", async () => {
    mockLayout();
    reschedule.mockResolvedValue({ ok: true });
    view([row("1", "Banner")]);
    await keyboardMove("Banner", ["ArrowDown"]);
    await waitFor(() => expect(reschedule).toHaveBeenCalledWith("1", "2026-10-21"));
  });

  it("does not drop on days before the request day", async () => {
    mockLayout();
    reschedule.mockResolvedValue({ ok: true });
    view([row("1", "Fresh", { requestDay: "2026-10-08", deadlineDay: "2026-10-08" })]);
    await keyboardMove("Fresh", ["ArrowLeft"]);
    expect(reschedule).not.toHaveBeenCalled();
    expect(within(cell("Thursday 8 October")).getByRole("link", { name: "Fresh" })).toBeTruthy();
  });

  it("never lands on a disabled day: left stops at the request day, up skips nothing earlier", async () => {
    mockLayout();
    reschedule.mockResolvedValue({ ok: true });
    view([row("1", "Fresh", { requestDay: "2026-10-08", deadlineDay: "2026-10-09" })]);
    await keyboardMove("Fresh", ["ArrowLeft", "ArrowLeft", "ArrowUp"]);
    await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
    expect(reschedule).toHaveBeenCalledWith("1", "2026-10-08");
  });

  it("does not call the server when the card is dropped back on its own day", async () => {
    mockLayout();
    view([row("1", "Banner")]);
    await keyboardMove("Banner", ["ArrowRight", "ArrowLeft"]);
    expect(reschedule).not.toHaveBeenCalled();
  });

  it("sets a first deadline when a no-deadline card is dropped on today", async () => {
    mockLayout();
    reschedule.mockResolvedValue({ ok: true });
    view([row("1", "Loose", { deadline: null, deadlineDay: null, daysLeft: null })]);
    await keyboardMove("Loose", ["ArrowRight", "ArrowLeft"]);
    await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
    expect(reschedule).toHaveBeenCalledWith("1", TODAY);
  });

  it("blocks every other drag while a move is pending", async () => {
    mockLayout();
    let settle: (v: unknown) => void = () => {};
    reschedule.mockReturnValueOnce(new Promise((r) => { settle = r; }));
    view([row("1", "Banner"), row("2", "Poster", { deadlineDay: "2026-10-20" })]);
    await keyboardMove("Banner", ["ArrowRight"]);
    await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(1));
    // Move 1 is still in flight: neither the other card nor the moved one can be picked up.
    expect(document.querySelector('[data-card="2"] [aria-disabled="true"]')).toBeTruthy();
    await keyboardMove("Poster", ["ArrowRight"]);
    expect(reschedule).toHaveBeenCalledTimes(1);
    await act(async () => { settle({ ok: true }); });
    reschedule.mockResolvedValue({ ok: true });
    await keyboardMove("Poster", ["ArrowRight"]);
    await waitFor(() => expect(reschedule).toHaveBeenCalledTimes(2));
    expect(reschedule).toHaveBeenLastCalledWith("2", "2026-10-21");
  });

  it("puts the card back and shows the server message when the move is refused", async () => {
    mockLayout();
    reschedule.mockResolvedValue({ ok: false, code: "CLOSED", message: "This request is already done." });
    view([row("1", "Banner")]);
    await keyboardMove("Banner", ["ArrowRight"]);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("This request is already done.");
    expect(within(cell("Wednesday 14 October")).getByRole("link", { name: "Banner" })).toBeTruthy();
    expect(within(cell("Thursday 15 October")).queryByRole("link", { name: "Banner" })).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is read-only without canMove: no drag handles or draggable attributes", () => {
    view([row("1", "Banner")], false);
    expect(document.querySelector("[aria-roledescription]")).toBeNull();
    expect(screen.queryByRole("button", { name: /drag/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Banner" })).toBeTruthy();
  });

  it("shows an empty state with a Today link when nothing is due", () => {
    view([]);
    const empty = screen.getByText("Nothing due in October").parentElement!;
    expect(within(empty).getByRole("link", { name: "Today" }).getAttribute("href")).toBe(HREFS.todayHref);
    expect(document.querySelector("[data-day]")).toBeNull();
  });

  it("narrow screens get an agenda list of the days that have cards, without dragging", () => {
    mockNarrow(true);
    view([row("1", "Banner"), row("2", "Poster"), row("3", "Loose", { deadlineDay: null, deadline: null, daysLeft: null })]);
    const agenda = screen.getByRole("list", { name: "Days with requests" });
    const days = Array.from(agenda.children);
    expect(days).toHaveLength(2);
    expect(within(days[0] as HTMLElement).getByRole("heading").textContent).toMatch(/^Thursday 8 October/);
    expect(within(days[1] as HTMLElement).getAllByRole("link").map((l) => l.textContent)).toEqual(["Banner", "Poster"]);
    expect(document.querySelector("[aria-roledescription]")).toBeNull();
    expect(document.querySelector("[data-day]")).toBeNull();
  });
});

describe("CalendarSkeleton", () => {
  it("is a busy status with a 35-day placeholder grid", () => {
    render(<CalendarSkeleton />);
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(document.querySelectorAll("[data-skeleton-day]")).toHaveLength(35);
  });
});
