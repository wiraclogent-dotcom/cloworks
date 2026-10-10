import { describe, it, expect } from "vitest";
import { buildBriefMonth, type BriefItem } from "@/lib/briefCalendar";

let n = 0;
const item = (requesterId: string, requestDay: string, typeName = "Social Media"): BriefItem =>
  ({ id: `i${++n}`, title: `t${n}`, requesterId, requesterName: requesterId.toUpperCase(), requestDay, typeName, status: "DONE" });
const ITEMS: BriefItem[] = [
  item("f", "2026-10-01"), item("f", "2026-10-03"), item("f", "2026-10-08"), item("f", "2026-10-08"),
  item("s", "2026-10-08", "General Design"), item("d", "2026-10-05", "Motion Support"),
];
const cell = (m: ReturnType<typeof buildBriefMonth>, day: string) => m.weeks.flat().find((d) => d.day === day)!;

describe("buildBriefMonth", () => {
  const m = buildBriefMonth("2026-10", "2026-10-08", ITEMS);

  it("lays out a Monday-first grid with day-off and future flags", () => {
    expect(m.weeks[0][0].day).toBe("2026-09-28");
    expect(cell(m, "2026-10-04").isDayOff).toBe(true);
    expect(cell(m, "2026-10-03").isDayOff).toBe(false);
    expect(cell(m, "2026-10-09").isFuture).toBe(true);
    expect(cell(m, "2026-10-08").isFuture).toBe(false);
  });

  it("counts every requester's briefs per day", () => {
    expect(cell(m, "2026-10-08").count).toBe(3);
    expect(cell(m, "2026-10-02").count).toBe(0);
    expect(m.itemsByDay["2026-10-08"]).toHaveLength(3);
  });

  it("summarises the month: total, today, per elapsed work day, busiest day and by type", () => {
    // 7 elapsed work days (1–3, 5–8 Oct; Sunday 4 Oct is off) and 6 briefs.
    expect(m.summary).toEqual({
      total: 6,
      today: 3,
      perWorkday: 6 / 7,
      busiest: { day: "2026-10-08", count: 3 },
      byType: [{ name: "Social Media", count: 4 }, { name: "General Design", count: 1 }, { name: "Motion Support", count: 1 }],
    });
  });

  it("busiest day ties go to the earliest day", () => {
    const x = buildBriefMonth("2026-10", "2026-10-08", [item("a", "2026-10-06"), item("a", "2026-10-02")]);
    expect(x.summary.busiest).toEqual({ day: "2026-10-02", count: 1 });
  });

  it("a past month has no today and averages over all its work days; a future or empty month has nothing", () => {
    const sep = buildBriefMonth("2026-09", "2026-10-08", [item("a", "2026-09-10"), item("a", "2026-09-11")]);
    expect(sep.summary.today).toBeNull();
    expect(sep.summary.perWorkday).toBe(2 / 26);
    const nov = buildBriefMonth("2026-11", "2026-10-08", []);
    expect(nov.summary).toEqual({ total: 0, today: null, perWorkday: null, busiest: null, byType: [] });
  });

  it("week columns follow the grid rows, labelled by their in-month days", () => {
    expect(m.weekCols).toEqual([
      { label: "1–4 Oct", started: true },
      { label: "5–11 Oct", started: true },
      { label: "12–18 Oct", started: false },
      { label: "19–25 Oct", started: false },
      { label: "26–31 Oct", started: false },
    ]);
  });

  it("one row per requester with briefs per week, most briefs first, then by name", () => {
    expect(m.rows).toEqual([
      { person: { id: "f", name: "F" }, perWeek: [2, 2, 0, 0, 0], total: 4 },
      { person: { id: "d", name: "D" }, perWeek: [0, 1, 0, 0, 0], total: 1 },
      { person: { id: "s", name: "S" }, perWeek: [0, 1, 0, 0, 0], total: 1 },
    ]);
  });

  it("each day lists who briefed and how many, in the same order as the weekly table", () => {
    expect(cell(m, "2026-10-08").people).toEqual([{ person: { id: "f", name: "F" }, count: 2 }, { person: { id: "s", name: "S" }, count: 1 }]);
    expect(cell(m, "2026-10-05").people).toEqual([{ person: { id: "d", name: "D" }, count: 1 }]);
    expect(cell(m, "2026-10-02").people).toEqual([]);
  });

  it("ignores days outside the month", () => {
    const x = buildBriefMonth("2026-10", "2026-10-08", [item("f", "2026-11-02"), item("f", "2026-09-30")]);
    expect(cell(x, "2026-09-30").count).toBe(0);
    expect(x.summary.total).toBe(0);
    expect(x.rows).toEqual([]);
    expect(Object.keys(x.itemsByDay)).toEqual([]);
  });
});
