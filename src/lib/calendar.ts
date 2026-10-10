import { jakartaDate } from "./createRequest";

/** Pure, client-safe month-grid helpers. All date maths is on `YYYY-MM-DD` strings via UTC (no local time zone). */

export type CalendarDay = { day: string; inMonth: boolean; isToday: boolean; weekday: number };
export type CalendarItem = { id: string; deadlineDay: string | null; requestDay: string };

export const DAY_MS = 86_400_000;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number) => String(n).padStart(2, "0");
export const utc = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12);
};
export const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** 0 = Monday ... 6 = Sunday. */
export const weekdayOf = (ms: number) => (new Date(ms).getUTCDay() + 6) % 7;

export function parseMonth(raw: string | undefined, now: Date): string {
  const m = raw ? /^(\d{4})-(\d{2})$/.exec(raw) : null;
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) return raw as string;
  }
  return jakartaDate(now).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function buildMonthGrid(month: string, today: string): { weeks: CalendarDay[][]; from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const first = Date.UTC(y, m - 1, 1, 12);
  const last = Date.UTC(y, m, 0, 12);
  const start = first - weekdayOf(first) * DAY_MS;
  const end = last + (6 - weekdayOf(last)) * DAY_MS;
  const weeks: CalendarDay[][] = [];
  for (let ms = start; ms <= end; ms += 7 * DAY_MS) {
    const week: CalendarDay[] = [];
    for (let i = 0; i < 7; i++) {
      const day = fmt(ms + i * DAY_MS);
      week.push({ day, inMonth: day.slice(0, 7) === month, isToday: day === today, weekday: i });
    }
    weeks.push(week);
  }
  return { weeks, from: fmt(start), to: fmt(end) };
}

/** Group by deadline day; items without a deadline sit on `today`. Insertion order is kept. */
export function bucketByDay<T extends CalendarItem>(items: T[], today: string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const day = it.deadlineDay ?? today;
    const list = map.get(day);
    if (list) list.push(it);
    else map.set(day, [it]);
  }
  return map;
}

export function splitVisible<T>(items: T[], max = 3): { shown: T[]; more: number } {
  return { shown: items.slice(0, max), more: Math.max(0, items.length - max) };
}

/** "2026-10-14" -> "Wednesday 14 October". */
export function dayLabel(day: string): string {
  const ms = utc(day);
  const d = new Date(ms);
  return `${WEEKDAYS[weekdayOf(ms)]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
