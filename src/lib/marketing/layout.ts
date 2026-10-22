import { DAY_MS, utc, type CalendarDay } from "../calendar";
import type { CalActivity, CalDivision } from "./types";

/** Pure, client-safe week/lane layout of the Marketing Calendar grid (spec 2026-10-19). */

/** One bar inside a week: 1-based column and span; `continues*` = the item runs on past that edge of the week. */
export type Segment = { id: string; col: number; span: number; continuesLeft: boolean; continuesRight: boolean };
/** A division's lane in one week; always at least one (possibly empty) row. */
export type WeekLane = { divisionId: string; rows: Segment[][] };
export type MarketingWeek = { days: CalendarDay[]; lanes: WeekLane[] };

type Span = { id: string; startDay: string; endDay: string };

const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY_MS);

/**
 * Clips items to [weekStart, weekEnd] and packs them into rows: by start column, longer first, then id; each goes
 * into the first row whose last used column is before its start, else a new row.
 */
export function packSegments(items: Span[], weekStart: string, weekEnd: string): Segment[][] {
  const segments = items
    .filter((it) => it.startDay <= weekEnd && it.endDay >= weekStart)
    .map((it) => {
      const lo = it.startDay < weekStart ? weekStart : it.startDay;
      const hi = it.endDay > weekEnd ? weekEnd : it.endDay;
      return { id: it.id, col: daysBetween(weekStart, lo) + 1, span: daysBetween(lo, hi) + 1, continuesLeft: it.startDay < weekStart, continuesRight: it.endDay > weekEnd };
    })
    .sort((a, b) => a.col - b.col || b.span - a.span || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rows: Segment[][] = [];
  const lastCol: number[] = [];
  for (const s of segments) {
    let r = lastCol.findIndex((end) => end < s.col);
    if (r < 0) { r = rows.length; rows.push([]); lastCol.push(0); }
    rows[r].push(s);
    lastCol[r] = s.col + s.span - 1;
  }
  return rows;
}

/** One entry per grid week: one lane per division, in the given order. */
export function buildMarketingWeeks(weeks: CalendarDay[][], divisions: CalDivision[], activities: CalActivity[]): MarketingWeek[] {
  return weeks.map((days) => {
    const start = days[0].day, end = days[days.length - 1].day;
    return {
      days,
      lanes: divisions.map((d) => {
        const rows = packSegments(activities.filter((a) => a.divisionId === d.id), start, end);
        return { divisionId: d.id, rows: rows.length ? rows : [[]] };
      }),
    };
  });
}
