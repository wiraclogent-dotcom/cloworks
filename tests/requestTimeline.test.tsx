// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { RequestTimeline } from "@/components/RequestTimeline";
import { TimelineSkeleton } from "@/components/RequestSkeletons";
import type { TimelineRow } from "@/lib/requests";

const TODAY = "2026-10-08"; // Thursday; the default window runs Mon 28 Sep to Sun 11 Oct.
const WEEK = "2026-09-28";
const PEOPLE = [{ id: "a", name: "Adi" }, { id: "b", name: "Bea" }];
const HREFS = { prevHref: "/requests?view=timeline&week=2026-09-21", nextHref: "/requests?view=timeline&week=2026-10-05", todayHref: "/requests?view=timeline" };

const row = (id: string, title: string, extra: Partial<TimelineRow> = {}): TimelineRow => ({
  id, title, status: "ON_PROGRESS", brandName: "Clogent", divisionName: "DivX", requesterName: "Rina", assigneeName: "Adi", assigneeId: "a",
  requestedAt: new Date("2026-09-30T17:00:00Z"), deadline: new Date("2026-10-13T17:00:00Z"), outputCount: 1, daysLeft: 6,
  needsMotion: false, requestDay: "2026-10-01", deadlineDay: "2026-10-14", ...extra,
});

const view = (rows: TimelineRow[], extra: Partial<Parameters<typeof RequestTimeline>[0]> = {}) =>
  render(<RequestTimeline rows={rows} people={PEOPLE} week={WEEK} today={TODAY} {...HREFS} {...extra} />);

const section = (name: string) => screen.getByRole("region", { name: new RegExp(`^${name}`) });
const bar = (id: string) => document.querySelector<HTMLAnchorElement>(`[data-bar="${id}"]`)!;

function mockNarrow(narrow: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q === "(max-width: 639px)" ? narrow : false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => mockNarrow(false));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("RequestTimeline", () => {
  it("renders the range heading, week navigation and 14 day columns", () => {
    view([row("1", "Banner")]);
    expect(screen.getByRole("heading", { name: "28 Sep – 11 Oct 2026" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Previous week" }).getAttribute("href")).toBe(HREFS.prevHref);
    expect(screen.getByRole("link", { name: "Next week" }).getAttribute("href")).toBe(HREFS.nextHref);
    expect(screen.getByRole("link", { name: "Today" }).getAttribute("href")).toBe(HREFS.todayHref);
    const days = document.querySelectorAll("[data-day]");
    expect(days).toHaveLength(14);
    expect(document.querySelector(`[data-day="${TODAY}"]`)!.getAttribute("aria-current")).toBe("date");
    expect(document.querySelectorAll("[data-day][data-weekend]")).toHaveLength(4);
  });

  it("shows both years when the window crosses a new year", () => {
    render(<RequestTimeline rows={[row("1", "Banner", { requestDay: "2026-01-02", deadlineDay: "2026-01-05" })]} people={PEOPLE} week="2025-12-29" today="2026-01-02" {...HREFS} />);
    expect(screen.getByRole("heading", { name: "29 Dec 2025 – 11 Jan 2026" })).toBeTruthy();
  });

  it("has a section per team member, empty ones included, and Unassigned last only when it has bars", () => {
    view([row("1", "Banner")]);
    expect(within(section("Adi")).getByText("1 open")).toBeTruthy();
    expect(within(section("Bea")).getByText("0 open")).toBeTruthy();
    expect(screen.queryByRole("region", { name: /^Unassigned/ })).toBeNull();
    cleanup();
    view([row("1", "Banner"), row("2", "Poster", { assigneeId: null, assigneeName: null })]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Adi", "Bea", "Unassigned"]);
    expect(within(section("Unassigned")).getByText("1 open")).toBeTruthy();
  });

  it("stacks overlapping bars into lanes and links each bar to its request", () => {
    view([row("1", "Banner"), row("2", "Poster", { requestDay: "2026-10-03", deadlineDay: "2026-10-09" })]);
    expect(bar("1").getAttribute("data-lane")).toBe("0");
    expect(bar("2").getAttribute("data-lane")).toBe("1");
    expect(bar("1").getAttribute("href")).toBe("/requests/1");
    expect(bar("1").parentElement!.style.gridColumn).toBe("4 / 15");
    expect(bar("1").textContent).toContain("Banner, On progress, requested 1 Oct, due 14 Oct");
  });

  it("draws an overdue tail from the deadline to today", () => {
    view([row("1", "Banner", { deadlineDay: "2026-10-05" })]);
    const tail = bar("1").querySelector("[data-overdue-tail]")!;
    expect(tail.getAttribute("data-tone")).toBe("overdue");
    expect(tail.textContent).toContain("Overdue");
    expect(bar("1").textContent).toContain("overdue since 5 Oct");
  });

  it("marks a no-deadline bar", () => {
    view([row("1", "Banner", { deadlineDay: null, deadline: null })]);
    expect(bar("1").hasAttribute("data-no-deadline")).toBe(true);
    expect(bar("1").textContent).toContain("No deadline");
    expect(bar("1").textContent).toContain("requested 1 Oct, no deadline");
  });

  it("shows chevrons where a bar is cut off by the window", () => {
    view([row("1", "Banner", { requestDay: "2026-09-20", deadlineDay: "2026-10-20" })]);
    expect(bar("1").querySelector('[data-clipped="start"]')).toBeTruthy();
    expect(bar("1").querySelector('[data-clipped="end"]')).toBeTruthy();
  });

  it("lists each person's requests on phones", () => {
    mockNarrow(true);
    view([row("1", "Banner"), row("2", "Poster", { deadlineDay: "2026-10-05" })]);
    expect(document.querySelector("[data-day]")).toBeNull();
    const adi = section("Adi");
    expect(within(adi).getByRole("link", { name: "Banner" }).getAttribute("href")).toBe("/requests/1");
    expect(within(adi).getByText("1 Oct → 14 Oct")).toBeTruthy();
    expect(within(adi).getByText("Overdue")).toBeTruthy();
    expect(within(section("Bea")).getByText("No open requests")).toBeTruthy();
  });

  it("shows an empty state without bars", () => {
    view([]);
    expect(screen.getByText("No open requests in these two weeks")).toBeTruthy();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("shows a filtered empty state with a way out", () => {
    view([], { filtered: true, clearHref: "/requests?view=timeline" });
    expect(screen.getByText("No requests match these filters in these two weeks")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/requests?view=timeline");
  });
});

describe("TimelineSkeleton", () => {
  it("is a labelled loading region", () => {
    render(<TimelineSkeleton />);
    expect(screen.getByRole("status").textContent).toContain("Loading timeline…");
    expect(document.querySelector("[data-skeleton-timeline]")).toBeTruthy();
  });
});
