import { describe, it, expect } from "vitest";
import { buildMonthGrid } from "@/lib/calendar";
import { buildMarketingWeeks, packSegments } from "@/lib/marketing/layout";
import type { CalActivity, CalDivision } from "@/lib/marketing/types";

// October 2026 (Monday first): week 0 = 28 Sep–4 Oct, 1 = 5–11, 2 = 12–18, 3 = 19–25, 4 = 26 Oct–1 Nov.
const grid = buildMonthGrid("2026-10", "2026-10-19");
const divisions: CalDivision[] = [
  { id: "brand", name: "Brand", tone: "div-1" }, { id: "ads", name: "Digital Ads", tone: "div-2" }, { id: "kol", name: "KOL", tone: "div-3" },
];
let n = 0;
const act = (divisionId: string, startDay: string, endDay: string): CalActivity =>
  ({ id: `a${++n}`, divisionId, title: "t", startDay, endDay, status: "CONFIRMED", updatedByName: "W", updatedAt: "2026-10-01T00:00:00.000Z" });
const seg = (weeks: ReturnType<typeof buildMarketingWeeks>, w: number, div: string) => weeks[w].lanes.find((l) => l.divisionId === div)!.rows;

describe("packSegments", () => {
  it("clips to the week and marks cut edges", () => {
    expect(packSegments([{ id: "x", startDay: "2026-10-08", endDay: "2026-10-14" }], "2026-10-05", "2026-10-11"))
      .toEqual([[{ id: "x", col: 4, span: 4, continuesLeft: false, continuesRight: true }]]);
    expect(packSegments([{ id: "x", startDay: "2026-10-08", endDay: "2026-10-14" }], "2026-10-12", "2026-10-18"))
      .toEqual([[{ id: "x", col: 1, span: 3, continuesLeft: true, continuesRight: false }]]);
  });
  it("stacks three overlaps and lets a later one reuse the first row", () => {
    const rows = packSegments([
      { id: "a", startDay: "2026-10-05", endDay: "2026-10-07" },
      { id: "b", startDay: "2026-10-06", endDay: "2026-10-08" },
      { id: "c", startDay: "2026-10-07", endDay: "2026-10-07" },
      { id: "d", startDay: "2026-10-09", endDay: "2026-10-10" },
    ], "2026-10-05", "2026-10-11");
    expect(rows.map((r) => r.map((s) => s.id))).toEqual([["a", "d"], ["b"], ["c"]]);
  });
  it("puts the longer of two same-day starts first", () => {
    const rows = packSegments([
      { id: "short", startDay: "2026-10-05", endDay: "2026-10-05" },
      { id: "long", startDay: "2026-10-05", endDay: "2026-10-09" },
    ], "2026-10-05", "2026-10-11");
    expect(rows.map((r) => r.map((s) => s.id))).toEqual([["long"], ["short"]]);
  });
  it("drops items outside the week", () => expect(packSegments([{ id: "x", startDay: "2026-10-12", endDay: "2026-10-13" }], "2026-10-05", "2026-10-11")).toEqual([]));
});

describe("buildMarketingWeeks", () => {
  it("places a 5–9 Oct activity in week 2 without cut edges", () => {
    const weeks = buildMarketingWeeks(grid.weeks, divisions, [act("brand", "2026-10-05", "2026-10-09")]);
    expect(seg(weeks, 1, "brand")).toEqual([[{ id: `a${n}`, col: 1, span: 5, continuesLeft: false, continuesRight: false }]]);
  });
  it("an activity starting on the grid's first day is not cut; one from earlier is", () => {
    const inGrid = act("ads", "2026-09-28", "2026-10-03");
    const earlier = act("kol", "2026-09-20", "2026-10-01");
    const weeks = buildMarketingWeeks(grid.weeks, divisions, [inGrid, earlier]);
    expect(seg(weeks, 0, "ads")[0][0]).toMatchObject({ col: 1, span: 6, continuesLeft: false });
    expect(seg(weeks, 0, "kol")[0][0]).toMatchObject({ col: 1, span: 4, continuesLeft: true });
  });
  it("keeps every division lane, in the given order, with one empty row when idle", () => {
    const weeks = buildMarketingWeeks(grid.weeks, divisions, []);
    expect(weeks).toHaveLength(5);
    for (const w of weeks) expect(w.lanes).toEqual(divisions.map((d) => ({ divisionId: d.id, rows: [[]] })));
  });
  it("ignores activities outside the grid and of unknown divisions", () => {
    const weeks = buildMarketingWeeks(grid.weeks, divisions, [act("brand", "2026-11-10", "2026-11-12"), act("creative", "2026-10-05", "2026-10-05")]);
    expect(weeks.every((w) => w.lanes.every((l) => l.rows.flat().length === 0))).toBe(true);
  });
});
