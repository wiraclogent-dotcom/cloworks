import { jakartaDate } from "./createRequest";
import { DAY_MS, fmt, utc, weekdayOf } from "./calendar";

/** Pure, client-safe layout for the request Timeline (workload per person). Days are `YYYY-MM-DD` Jakarta dates. */

export const TIMELINE_DAYS = 14;

export type TimelineDay = { day: string; weekday: number; isToday: boolean; isWeekend: boolean };
export type TimelineItem = { id: string; assigneeId: string | null; assigneeName: string | null; requestDay: string; deadlineDay: string | null };
export type TimelineBar = {
  id: string;
  /** Window columns 0..13, inclusive. */
  startCol: number; endCol: number;
  /** Column of the deadline of an overdue bar when it falls inside the window (the tail runs after it), else null. */
  planEndCol: number | null;
  clippedStart: boolean; clippedEnd: boolean;
  overdue: boolean; noDeadline: boolean;
};
export type TimelinePerson = { key: string; assigneeId: string | null; name: string; count: number; lanes: TimelineBar[][] };

const addDays = (day: string, n: number) => fmt(utc(day) + n * DAY_MS);
const mondayOf = (day: string) => addDays(day, -weekdayOf(utc(day)));
const diffDays = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY_MS);

/** The Monday of the week before `today`'s week: the window shows last week and this week. */
export function defaultWeek(today: string): string {
  return addDays(mondayOf(today), -7);
}

/** A valid YYYY-MM-DD (2000–2100) snapped back to its Monday; anything else gives the default window. */
export function parseWeek(raw: string | undefined, now: Date): string {
  const m = raw ? /^(\d{4})-\d{2}-\d{2}$/.exec(raw) : null;
  if (m && raw) {
    const year = Number(m[1]);
    if (year >= 2000 && year <= 2100 && fmt(utc(raw)) === raw) return mondayOf(raw);
  }
  return defaultWeek(jakartaDate(now));
}

export function shiftWeek(week: string, delta: number): string {
  return addDays(week, delta * 7);
}

export function buildWindow(week: string, today: string): { days: TimelineDay[]; from: string; to: string } {
  const days = Array.from({ length: TIMELINE_DAYS }, (_, i): TimelineDay => {
    const day = addDays(week, i);
    const weekday = i % 7;
    return { day, weekday, isToday: day === today, isWeekend: weekday >= 5 };
  });
  return { days, from: days[0].day, to: days[TIMELINE_DAYS - 1].day };
}

/** Request day to deadline; overdue and no-deadline requests run to today. A bar never ends before it starts. */
export function barSpan(item: Pick<TimelineItem, "requestDay" | "deadlineDay">, today: string) {
  const start = item.requestDay;
  const planEnd = item.deadlineDay;
  const end = [planEnd ?? today, today, start].reduce((a, b) => (b > a ? b : a));
  return { start, planEnd, end, overdue: planEnd !== null && planEnd < today, noDeadline: planEnd === null };
}

/**
 * One entry per person: the given people (sorted by name, empty ones included) plus assignees that only appear in
 * the items, and "Unassigned" last when it has bars. With `assigneeId` only that person. Overlapping bars are
 * packed greedily into lanes.
 */
export function layoutRows(
  items: TimelineItem[],
  people: { id: string; name: string }[],
  window: { from: string; to: string },
  today: string,
  opts: { assigneeId?: string } = {},
): TimelinePerson[] {
  const last = diffDays(window.from, window.to);
  const bars = new Map<string, TimelineBar[]>();
  const names = new Map(people.map((p) => [p.id, p.name]));
  for (const it of items) {
    const span = barSpan(it, today);
    if (span.start > window.to || span.end < window.from) continue;
    const s = diffDays(window.from, span.start);
    const e = diffDays(window.from, span.end);
    const p = span.overdue && span.planEnd! >= window.from ? diffDays(window.from, span.planEnd!) : null;
    const bar: TimelineBar = {
      id: it.id, startCol: Math.max(0, s), endCol: Math.min(last, e), planEndCol: p,
      clippedStart: s < 0, clippedEnd: e > last, overdue: span.overdue, noDeadline: span.noDeadline,
    };
    const key = it.assigneeId ?? "unassigned";
    if (it.assigneeId && !names.has(it.assigneeId)) names.set(it.assigneeId, it.assigneeName ?? "Unknown");
    const list = bars.get(key);
    if (list) list.push(bar);
    else bars.set(key, [bar]);
  }

  const keys = opts.assigneeId ? [opts.assigneeId] : [...names.keys()];
  const order = keys
    .map((id) => ({ key: id, assigneeId: id as string | null, name: names.get(id) ?? "Unknown" }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  if (!opts.assigneeId && bars.has("unassigned")) order.push({ key: "unassigned", assigneeId: null, name: "Unassigned" });

  return order.map((p) => {
    const mine = (bars.get(p.key) ?? []).sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol || a.id.localeCompare(b.id));
    const lanes: TimelineBar[][] = [];
    for (const bar of mine) {
      const lane = lanes.find((l) => l[l.length - 1].endCol < bar.startCol);
      if (lane) lane.push(bar);
      else lanes.push([bar]);
    }
    return { ...p, count: mine.length, lanes };
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-01" -> "1 Oct". */
export function shortDay(day: string): string {
  return `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
}

/** "28 Sep – 11 Oct 2026"; both years when they differ. */
export function rangeLabel(from: string, to: string): string {
  const fy = from.slice(0, 4), ty = to.slice(0, 4);
  return `${shortDay(from)}${fy !== ty ? ` ${fy}` : ""} – ${shortDay(to)} ${ty}`;
}
