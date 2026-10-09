import { describe, it, expect } from "vitest";
import { barSpan, buildWindow, defaultWeek, layoutRows, parseWeek, shiftWeek, type TimelineItem } from "@/lib/workload";

const TODAY = "2026-10-08"; // Thursday

describe("weeks", () => {
  it("defaults to last week's Monday", () => expect(defaultWeek("2026-10-08")).toBe("2026-09-28"));
  it("defaults to last week's Monday on a Monday and a Sunday", () => {
    expect(defaultWeek("2026-10-05")).toBe("2026-09-28");
    expect(defaultWeek("2026-10-11")).toBe("2026-09-28");
  });
  it("parseWeek snaps to Monday and rejects junk", () => {
    const now = new Date("2026-10-08T05:00:00Z");
    expect(parseWeek("2026-10-14", now)).toBe("2026-10-12");
    expect(parseWeek("2026-10-12", now)).toBe("2026-10-12");
    expect(parseWeek("2026-10-18", now)).toBe("2026-10-12");
    for (const bad of [undefined, "", "bogus", "2026-02-30", "1999-12-27", "2101-01-03", "2026-1-5", "2026-10-12x"])
      expect(parseWeek(bad, now)).toBe("2026-09-28");
  });
  it("parseWeek default uses the Jakarta day", () =>
    expect(parseWeek(undefined, new Date("2026-10-11T18:00:00Z"))).toBe("2026-10-05")); // Mon 12 Oct in Jakarta
  it("shiftWeek moves whole weeks, across years", () => {
    expect(shiftWeek("2026-09-28", 1)).toBe("2026-10-05");
    expect(shiftWeek("2026-01-05", -1)).toBe("2025-12-29");
  });
});

describe("buildWindow", () => {
  it("is 14 Monday-first days with Sundays off (Saturday is a workday) and today", () => {
    const w = buildWindow("2026-09-28", TODAY);
    expect(w).toMatchObject({ from: "2026-09-28", to: "2026-10-11" });
    expect(w.days).toHaveLength(14);
    expect(w.days[0]).toMatchObject({ day: "2026-09-28", weekday: 0 });
    expect(w.days.filter((d) => d.isDayOff).map((d) => d.day)).toEqual(["2026-10-04", "2026-10-11"]);
    expect(w.days.filter((d) => d.isToday).map((d) => d.day)).toEqual([TODAY]);
  });
});

describe("barSpan", () => {
  it("future deadline", () =>
    expect(barSpan({ requestDay: "2026-10-01", deadlineDay: "2026-10-14" }, TODAY))
      .toEqual({ start: "2026-10-01", planEnd: "2026-10-14", end: "2026-10-14", overdue: false, noDeadline: false }));
  it("deadline today is not overdue", () => expect(barSpan({ requestDay: "2026-10-01", deadlineDay: TODAY }, TODAY)).toMatchObject({ end: TODAY, overdue: false }));
  it("overdue runs to today", () =>
    expect(barSpan({ requestDay: "2026-10-01", deadlineDay: "2026-10-05" }, TODAY)).toMatchObject({ planEnd: "2026-10-05", end: TODAY, overdue: true }));
  it("no deadline runs to today", () =>
    expect(barSpan({ requestDay: "2026-10-01", deadlineDay: null }, TODAY)).toMatchObject({ planEnd: null, end: TODAY, noDeadline: true, overdue: false }));
  it("deadline before request day and request in the future: one day at start", () =>
    expect(barSpan({ requestDay: "2026-10-20", deadlineDay: "2026-10-19" }, TODAY)).toMatchObject({ start: "2026-10-20", end: "2026-10-20" }));
});

describe("layoutRows", () => {
  const W = { from: "2026-09-28", to: "2026-10-11" };
  const item = (id: string, assigneeId: string | null, requestDay: string, deadlineDay: string | null, assigneeName = assigneeId ? assigneeId.toUpperCase() : null): TimelineItem =>
    ({ id, assigneeId, assigneeName, requestDay, deadlineDay });
  const people = [{ id: "b", name: "Bea" }, { id: "a", name: "Adi" }, { id: "c", name: "Cami" }];

  it("lists every person by name, empty ones included", () => {
    const rows = layoutRows([item("1", "a", "2026-10-01", "2026-10-03")], people, W, TODAY);
    expect(rows.map((r) => r.name)).toEqual(["Adi", "Bea", "Cami"]);
    expect(rows.map((r) => r.count)).toEqual([1, 0, 0]);
    expect(rows[1].lanes).toEqual([]);
  });
  it("adds Unassigned last only when it has bars", () => {
    expect(layoutRows([], people, W, TODAY).map((r) => r.key)).toEqual(["a", "b", "c"]);
    const withU = layoutRows([item("2", null, "2026-10-01", null)], people, W, TODAY);
    expect(withU.at(-1)).toMatchObject({ key: "unassigned", name: "Unassigned", assigneeId: null, count: 1 });
  });
  it("adds assignees missing from the people list, sorted in by name, and keeps same-named people apart", () => {
    const rows = layoutRows([item("1", "x", "2026-10-01", "2026-10-02", "Bea")], people, W, TODAY);
    expect(rows.map((r) => r.key)).toEqual(["a", "b", "x", "c"]);
  });
  it("with an assignee filter shows only that person", () =>
    expect(layoutRows([], people, W, TODAY, { assigneeId: "c" }).map((r) => r.key)).toEqual(["c"]));
  it("packs overlapping bars into lanes", () => {
    const rows = layoutRows([
      item("1", "a", "2026-10-08", "2026-10-09"), item("2", "a", "2026-10-09", "2026-10-11"), item("3", "a", "2026-10-10", "2026-10-11"),
    ], people, W, TODAY);
    expect(rows[0].lanes.map((l) => l.map((b) => b.id))).toEqual([["1", "3"], ["2"]]);
    expect(rows[0].lanes[0][1]).toMatchObject({ startCol: 12, endCol: 13, overdue: false, planEndCol: null });
    expect(rows[0].count).toBe(3);
  });
  it("clips at both window edges", () => {
    const [bar] = layoutRows([item("1", "a", "2026-09-20", "2026-10-20")], people, W, TODAY)[0].lanes[0];
    expect(bar).toMatchObject({ startCol: 0, endCol: 13, clippedStart: true, clippedEnd: true });
  });
  it("marks the deadline column of an overdue bar, null when the deadline is before the window", () => {
    const rows = layoutRows([item("1", "a", "2026-10-01", "2026-10-05"), item("2", "b", "2026-09-10", "2026-09-20")], people, W, TODAY);
    expect(rows[0].lanes[0][0]).toMatchObject({ overdue: true, planEndCol: 7, startCol: 3, endCol: 10, clippedStart: false });
    expect(rows[1].lanes[0][0]).toMatchObject({ overdue: true, planEndCol: null, startCol: 0, endCol: 10, clippedStart: true });
  });
  it("flags no-deadline bars", () =>
    expect(layoutRows([item("1", "a", "2026-10-06", null)], people, W, TODAY)[0].lanes[0][0]).toMatchObject({ noDeadline: true, startCol: 8, endCol: 10 }));
  it("skips items whose span misses the window", () =>
    expect(layoutRows([item("1", "a", "2026-10-20", "2026-10-25")], people, W, TODAY)[0].count).toBe(0));
});
