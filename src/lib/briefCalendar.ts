import type { RequestStatus } from "@prisma/client";
import { buildMonthGrid, type CalendarDay } from "./calendar";

/**
 * Brief calendar month model (spec 2026-10-10, updated 2026-10-10): how many briefs (submitted requests) came in each
 * day from anyone, a month summary, and each requester's briefs per calendar week. Pure and client-safe; days are
 * Jakarta `YYYY-MM-DD` strings. The team works Monday to Saturday; Sunday is the only day off.
 */

export type BriefPerson = { id: string; name: string };
export type BriefItem = {
  id: string; title: string; requesterId: string; requesterName: string; requestDay: string; typeName: string; status: RequestStatus;
};
/** `people`: who briefed that day and how many, in the weekly table's order (most briefs this month first). */
export type BriefDay = CalendarDay & { isDayOff: boolean; isFuture: boolean; count: number; people: { person: BriefPerson; count: number }[] };
export type BriefSummary = {
  total: number;
  /** Briefs today; null when today is not in this month. */
  today: number | null;
  /** Briefs up to today per elapsed work day (Mon–Sat); null before the month's first work day. */
  perWorkday: number | null;
  busiest: { day: string; count: number } | null;
  byType: { name: string; count: number }[];
};
/** One column per calendar row; `started` is false for weeks whose first in-month day is after today. */
export type BriefWeek = { label: string; started: boolean };
export type BriefRow = { person: BriefPerson; perWeek: number[]; total: number };
export type BriefMonth = { weeks: BriefDay[][]; summary: BriefSummary; weekCols: BriefWeek[]; rows: BriefRow[]; itemsByDay: Record<string, BriefItem[]> };

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayNum = (day: string) => Number(day.slice(8));

export function buildBriefMonth(month: string, today: string, items: BriefItem[]): BriefMonth {
  const itemsByDay: Record<string, BriefItem[]> = {};
  for (const it of items) if (it.requestDay.startsWith(month)) (itemsByDay[it.requestDay] ??= []).push(it);

  const weeks = buildMonthGrid(month, today).weeks.map((week) =>
    week.map((d): BriefDay => ({ ...d, isDayOff: d.weekday === 6, isFuture: d.day > today, count: d.inMonth ? itemsByDay[d.day]?.length ?? 0 : 0, people: [] })),
  );
  const days = weeks.flat().filter((d) => d.inMonth);

  // Summary
  let total = 0, upToToday = 0, elapsedWorkdays = 0;
  let busiest: BriefSummary["busiest"] = null;
  const byType = new Map<string, number>();
  for (const d of days) {
    total += d.count;
    if (!d.isFuture) {
      upToToday += d.count;
      if (!d.isDayOff) elapsedWorkdays += 1;
    }
    if (d.count > 0 && (!busiest || d.count > busiest.count)) busiest = { day: d.day, count: d.count };
    for (const it of itemsByDay[d.day] ?? []) byType.set(it.typeName, (byType.get(it.typeName) ?? 0) + 1);
  }
  const summary: BriefSummary = {
    total,
    today: today.startsWith(month) ? itemsByDay[today]?.length ?? 0 : null,
    perWorkday: elapsedWorkdays > 0 ? upToToday / elapsedWorkdays : null,
    busiest,
    byType: [...byType].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };

  // Briefs per requester per calendar row
  const mon = MONTH_SHORT[Number(month.slice(5, 7)) - 1];
  const weekCols: BriefWeek[] = [];
  const rowsById = new Map<string, BriefRow>();
  const inMonthWeeks = weeks.map((w) => w.filter((d) => d.inMonth));
  inMonthWeeks.forEach((w, wi) => {
    weekCols.push({ label: `${dayNum(w[0].day)}–${dayNum(w[w.length - 1].day)} ${mon}`, started: w[0].day <= today });
    for (const d of w)
      for (const it of itemsByDay[d.day] ?? []) {
        let row = rowsById.get(it.requesterId);
        if (!row) rowsById.set(it.requesterId, (row = { person: { id: it.requesterId, name: it.requesterName }, perWeek: inMonthWeeks.map(() => 0), total: 0 }));
        row.perWeek[wi] += 1;
        row.total += 1;
      }
  });
  const rows = [...rowsById.values()].sort((a, b) => b.total - a.total || a.person.name.localeCompare(b.person.name));

  const order = new Map(rows.map((r, i) => [r.person.id, i]));
  for (const d of days) {
    const per = new Map<string, number>();
    for (const it of itemsByDay[d.day] ?? []) per.set(it.requesterId, (per.get(it.requesterId) ?? 0) + 1);
    d.people = [...per].sort((a, b) => order.get(a[0])! - order.get(b[0])!).map(([id, count]) => ({ person: rows[order.get(id)!].person, count }));
  }

  return { weeks, summary, weekCols, rows, itemsByDay };
}
