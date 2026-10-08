import { JAKARTA_OFFSET_MS } from "./kpi/workingDays";

const DAY_MS = 86_400_000;
export const MAX_TIMELINE_WEEKS = 26;
const MIN_BAR_PCT = 1.5;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type TimelineProject = { id: string; startDate: Date | null; dueDate: Date | null };
export type TimelineLayout = {
  weeks: { label: string; startDay: number }[];
  bars: { id: string; leftPct: number; widthPct: number; clipped: boolean }[];
  /** Position of today's day column centre, or null when today is outside the span. */
  todayPct: number | null;
  /** True when the span was cut at the week cap. */
  truncated: boolean;
  /** Ids of projects that start after the cap and so have no bar. */
  omitted: string[];
};

/** Days since 1970-01-01 of the Jakarta calendar date of an instant. */
const dayNum = (d: Date) => Math.floor((d.getTime() + JAKARTA_OFFSET_MS) / DAY_MS);
/** 0 = Monday ... 6 = Sunday (1970-01-01 was a Thursday). */
const mondayIndex = (day: number) => (((day + 3) % 7) + 7) % 7;

/**
 * Pure layout for the week-based timeline. Only projects with both dates (and due >= start) are laid out.
 * Weeks start on Monday (Jakarta calendar); `startDay` is the day offset from the first Monday. Bars cover whole
 * calendar days (due day included) and get a minimum width so a same-day project stays visible.
 */
export function timelineLayout(projects: TimelineProject[], today: Date, maxWeeks = MAX_TIMELINE_WEEKS): TimelineLayout {
  const usable = projects
    .filter((p): p is { id: string; startDate: Date; dueDate: Date } => !!p.startDate && !!p.dueDate)
    .map((p) => ({ id: p.id, s: dayNum(p.startDate), e: dayNum(p.dueDate) }))
    .filter((p) => p.e >= p.s);
  if (usable.length === 0) return { weeks: [], bars: [], todayPct: null, truncated: false, omitted: [] };

  const minStart = Math.min(...usable.map((p) => p.s));
  const maxEnd = Math.max(...usable.map((p) => p.e));
  const origin = minStart - mondayIndex(minStart);
  const wantWeeks = Math.ceil((maxEnd - origin + 1) / 7);
  const weekCount = Math.min(wantWeeks, maxWeeks);
  const total = weekCount * 7;

  let prevYear = -1;
  const weeks = Array.from({ length: weekCount }, (_, i) => {
    const dt = new Date((origin + i * 7) * DAY_MS);
    const y = dt.getUTCFullYear();
    const label = `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}${y !== prevYear ? ` ${y}` : ""}`;
    prevYear = y;
    return { label, startDay: i * 7 };
  });

  const bars: TimelineLayout["bars"] = [];
  const omitted: string[] = [];
  for (const p of usable) {
    const s = p.s - origin;
    if (s >= total) {
      omitted.push(p.id);
      continue;
    }
    const clipped = p.e - origin >= total;
    const e = Math.min(p.e - origin, total - 1);
    const widthPct = Math.min(Math.max(((e - s + 1) / total) * 100, MIN_BAR_PCT), 100);
    const leftPct = Math.min((s / total) * 100, 100 - widthPct);
    bars.push({ id: p.id, leftPct, widthPct, clipped });
  }

  const t = dayNum(today) - origin;
  return { weeks, bars, todayPct: t >= 0 && t < total ? ((t + 0.5) / total) * 100 : null, truncated: wantWeeks > maxWeeks, omitted };
}
