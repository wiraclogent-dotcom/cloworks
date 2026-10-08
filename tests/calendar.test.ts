import { describe, it, expect } from "vitest";
import { parseMonth, buildMonthGrid, shiftMonth, bucketByDay, splitVisible, dayLabel } from "../src/lib/calendar";

describe("buildMonthGrid", () => {
  it("covers Oct 2026 in 5 Monday-start weeks", () => {
    const g = buildMonthGrid("2026-10", "2026-10-08");
    expect(g.from).toBe("2026-09-28");
    expect(g.to).toBe("2026-11-01");
    expect(g.weeks).toHaveLength(5);
    const all = g.weeks.flat();
    expect(all.filter((d) => d.isToday).map((d) => d.day)).toEqual(["2026-10-08"]);
    expect(g.weeks[0][0]).toMatchObject({ day: "2026-09-28", inMonth: false, weekday: 0 });
    expect(g.weeks[0][3]).toMatchObject({ day: "2026-10-01", inMonth: true, weekday: 3 });
  });
  it("handles Feb 2026 (starts Sunday): 5 weeks from the previous Monday", () => {
    const g = buildMonthGrid("2026-02", "2026-02-01");
    expect(g.from).toBe("2026-01-26");
    expect(g.to).toBe("2026-03-01");
    expect(g.weeks).toHaveLength(5);
  });
  it("uses 6 weeks for Aug 2026 (starts Saturday, 31 days)", () => {
    const g = buildMonthGrid("2026-08", "2026-08-01");
    expect(g.from).toBe("2026-07-27");
    expect(g.to).toBe("2026-09-06");
    expect(g.weeks).toHaveLength(6);
  });
  it("includes leap day", () => {
    const d = buildMonthGrid("2028-02", "2028-02-01").weeks.flat().find((x) => x.day === "2028-02-29");
    expect(d?.inMonth).toBe(true);
  });
});

describe("parseMonth", () => {
  const now = new Date("2026-09-30T18:00:00Z");
  it("falls back to the Jakarta month", () => {
    for (const raw of ["2026-13", "abc", "1999-01", undefined, "2026-00", "2101-01"]) expect(parseMonth(raw, now)).toBe("2026-10");
  });
  it("accepts valid months", () => {
    expect(parseMonth("2026-03", now)).toBe("2026-03");
  });
});

describe("shiftMonth", () => {
  it("rolls over years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("bucketByDay", () => {
  it("puts null deadlines on today and keeps order", () => {
    const items = [
      { id: "a", deadlineDay: "2026-10-10", requestDay: "2026-10-01" },
      { id: "b", deadlineDay: null, requestDay: "2026-10-02" },
      { id: "c", deadlineDay: "2026-10-10", requestDay: "2026-10-03" },
    ];
    const m = bucketByDay(items, "2026-10-08");
    expect(m.get("2026-10-10")!.map((i) => i.id)).toEqual(["a", "c"]);
    expect(m.get("2026-10-08")!.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("splitVisible", () => {
  it("caps and counts the rest", () => {
    expect(splitVisible([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: 2 });
    expect(splitVisible([1, 2, 3])).toEqual({ shown: [1, 2, 3], more: 0 });
  });
});

describe("dayLabel", () => {
  it("is English full form", () => {
    expect(dayLabel("2026-10-14")).toBe("Wednesday 14 October");
  });
});
