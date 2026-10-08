import { describe, it, expect } from "vitest";
import { timelineLayout } from "@/lib/timeline";

const d = (s: string) => new Date(`${s}T00:00:00+07:00`);
const p = (id: string, s: string | null, e: string | null) => ({ id, startDate: s ? d(s) : null, dueDate: e ? d(e) : null });
const today = d("2026-10-08");

describe("timelineLayout", () => {
  it("lays out a single project on Monday-aligned weeks", () => {
    // Wed 7 Oct - Fri 9 Oct 2026; Monday is 5 Oct
    const l = timelineLayout([p("a", "2026-10-07", "2026-10-09")], today);
    expect(l.weeks).toEqual([{ label: "5 Oct 2026", startDay: 0 }]);
    expect(l.bars).toHaveLength(1);
    expect(l.bars[0].leftPct).toBeCloseTo((2 / 7) * 100, 5);
    expect(l.bars[0].widthPct).toBeCloseTo((3 / 7) * 100, 5);
    expect(l.bars[0].clipped).toBe(false);
  });
  it("aligns a weekend start to the preceding Monday", () => {
    const l = timelineLayout([p("a", "2026-10-11", "2026-10-13")], today); // Sun 11 .. Tue 13
    expect(l.weeks.map((w) => w.label)).toEqual(["5 Oct 2026", "12 Oct"]);
    expect(l.weeks.map((w) => w.startDay)).toEqual([0, 7]);
    expect(l.bars[0].leftPct).toBeCloseTo((6 / 14) * 100, 5);
    expect(l.bars[0].widthPct).toBeCloseTo((3 / 14) * 100, 5);
  });
  it("spans earliest start to latest due across projects", () => {
    const l = timelineLayout([p("a", "2026-10-07", "2026-10-09"), p("b", "2026-10-20", "2026-10-26")], today);
    expect(l.weeks).toHaveLength(4); // 5, 12, 19, 26 Oct
  });
  it("gives a same-day project a minimum visible width", () => {
    const l = timelineLayout([p("a", "2026-10-05", "2026-10-05"), p("b", "2026-10-05", "2027-03-30")], today);
    const a = l.bars.find((b) => b.id === "a")!;
    expect(a.widthPct).toBeGreaterThanOrEqual(1.5);
    expect(a.leftPct).toBe(0);
  });
  it("clips at the cap and drops projects wholly outside", () => {
    const l = timelineLayout([p("a", "2026-10-05", "2028-10-05"), p("b", "2026-10-06", "2026-10-08"), p("c", "2028-01-01", "2028-02-01")], today);
    expect(l.weeks).toHaveLength(26);
    expect(l.truncated).toBe(true);
    expect(l.bars.find((b) => b.id === "a")).toMatchObject({ clipped: true, leftPct: 0 });
    expect(l.bars.find((b) => b.id === "a")!.widthPct).toBeCloseTo(100, 5);
    expect(l.bars.find((b) => b.id === "b")!.clipped).toBe(false);
    expect(l.bars.find((b) => b.id === "c")).toBeUndefined();
    expect(l.omitted).toEqual(["c"]);
  });
  it("returns no bars when no project has both dates", () => {
    const l = timelineLayout([p("a", "2026-10-05", null), p("b", null, "2026-10-09"), p("c", null, null)], today);
    expect(l).toMatchObject({ weeks: [], bars: [], todayPct: null, truncated: false });
  });
  it("places the today marker at the middle of today's day column, or null when outside", () => {
    const l = timelineLayout([p("a", "2026-10-05", "2026-10-18")], today); // Thu = day 3 of 14
    expect(l.todayPct).toBeCloseTo((3.5 / 14) * 100, 5);
    expect(timelineLayout([p("a", "2026-10-05", "2026-10-18")], d("2026-12-01")).todayPct).toBeNull();
  });
  it("labels the year at a year boundary", () => {
    const l = timelineLayout([p("a", "2026-12-23", "2027-01-08")], today); // Monday 21 Dec
    expect(l.weeks.map((w) => w.label)).toEqual(["21 Dec 2026", "28 Dec", "4 Jan 2027"]);
  });
});
