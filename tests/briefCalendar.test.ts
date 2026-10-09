import { describe, it, expect } from "vitest";
import { buildBriefMonth, dotState, type BriefItem, type BriefPerson } from "@/lib/briefCalendar";

const PEOPLE: BriefPerson[] = [{ id: "r", name: "r" }, { id: "f", name: "f" }, { id: "s", name: "s" }];
let n = 0;
const item = (requesterId: string, requestDay: string): BriefItem =>
  ({ id: `i${++n}`, title: `t${n}`, requesterId, requestDay, typeName: "Social Media", status: "DONE" });
const ITEMS: BriefItem[] = [
  item("f", "2026-10-01"), item("f", "2026-10-03"), item("f", "2026-10-08"), item("f", "2026-10-08"),
  item("s", "2026-10-08"),
];
const cell = (m: ReturnType<typeof buildBriefMonth>, day: string) => m.weeks.flat().find((d) => d.day === day)!;

describe("dotState", () => {
  const weekday = { inMonth: true, isWeekend: false, isFuture: false };
  it("a past weekday with nothing is missed; with briefs is sent", () => {
    expect(dotState(weekday, 0)).toBe("missed");
    expect(dotState(weekday, 2)).toBe("sent");
  });
  it("weekends are never missed but still show briefs", () => {
    expect(dotState({ ...weekday, isWeekend: true }, 0)).toBe("none");
    expect(dotState({ ...weekday, isWeekend: true }, 1)).toBe("sent");
  });
  it("future days and out-of-month days show nothing", () => {
    expect(dotState({ ...weekday, isFuture: true }, 0)).toBe("none");
    expect(dotState({ ...weekday, inMonth: false }, 0)).toBe("none");
    expect(dotState({ ...weekday, inMonth: false }, 3)).toBe("none");
  });
});

describe("buildBriefMonth", () => {
  const m = buildBriefMonth("2026-10", "2026-10-08", PEOPLE, ITEMS);

  it("lays out a Monday-first grid with weekend and future flags", () => {
    expect(m.weeks[0][0].day).toBe("2026-09-28");
    expect(cell(m, "2026-10-10").isWeekend).toBe(true);
    expect(cell(m, "2026-10-09").isFuture).toBe(true);
    expect(cell(m, "2026-10-08").isFuture).toBe(false);
    for (const d of m.weeks.flat()) expect(d.perPerson.map((p) => p.personId)).toEqual(["r", "f", "s"]);
  });

  it("counts briefs per person per day", () => {
    const d = cell(m, "2026-10-08");
    expect(d.perPerson.map((p) => p.count)).toEqual([0, 2, 1]);
    expect(d.perPerson.map((p) => p.state)).toEqual(["missed", "sent", "sent"]);
    expect(m.itemsByDay["2026-10-08"]).toHaveLength(3);
  });

  it("summarises weekdays briefed against weekdays elapsed; weekend briefs count as briefs only", () => {
    const by = Object.fromEntries(m.summary.map((s) => [s.personId, s]));
    expect(by.f).toEqual({ personId: "f", weekdaysBriefed: 2, weekdaysElapsed: 6, briefs: 4 });
    expect(by.r).toEqual({ personId: "r", weekdaysBriefed: 0, weekdaysElapsed: 6, briefs: 0 });
  });

  it("a past month has all its weekdays elapsed; a future month none, and nothing missed", () => {
    expect(buildBriefMonth("2026-09", "2026-10-08", PEOPLE, []).summary[0].weekdaysElapsed).toBe(22);
    const future = buildBriefMonth("2026-11", "2026-10-08", PEOPLE, []);
    expect(future.summary[0].weekdaysElapsed).toBe(0);
    expect(future.weeks.flat().some((d) => d.perPerson.some((p) => p.state === "missed"))).toBe(false);
  });

  it("ignores unknown requesters and days outside the month", () => {
    const x = buildBriefMonth("2026-10", "2026-10-08", PEOPLE, [item("zz", "2026-10-08"), item("f", "2026-11-02"), item("f", "2026-09-30")]);
    expect(cell(x, "2026-10-08").perPerson.map((p) => p.count)).toEqual([0, 0, 0]);
    expect(cell(x, "2026-09-30").perPerson.map((p) => p.count)).toEqual([0, 0, 0]);
    expect(x.summary.every((s) => s.briefs === 0)).toBe(true);
    expect(Object.keys(x.itemsByDay)).toEqual([]);
  });
});
