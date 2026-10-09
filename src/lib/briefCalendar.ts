import type { RequestStatus } from "@prisma/client";
import { buildMonthGrid, type CalendarDay } from "./calendar";

/**
 * Brief calendar month model (spec 2026-10-10): for each day, did each social media person submit at least one
 * request? Pure and client-safe; days are Jakarta `YYYY-MM-DD` strings.
 */

export type BriefPerson = { id: string; name: string };
export type BriefItem = { id: string; title: string; requesterId: string; requestDay: string; typeName: string; status: RequestStatus };
export type DotState = "sent" | "missed" | "none";
export type BriefDay = CalendarDay & { isWeekend: boolean; isFuture: boolean; perPerson: { personId: string; count: number; state: DotState }[] };
export type BriefSummary = { personId: string; weekdaysBriefed: number; weekdaysElapsed: number; briefs: number };
export type BriefMonth = { weeks: BriefDay[][]; summary: BriefSummary[]; itemsByDay: Record<string, BriefItem[]> };

/** Weekends and future days are never "missed"; out-of-month days show nothing. */
export function dotState(day: { inMonth: boolean; isWeekend: boolean; isFuture: boolean }, count: number): DotState {
  if (!day.inMonth) return "none";
  if (count > 0) return "sent";
  return day.isWeekend || day.isFuture ? "none" : "missed";
}

export function buildBriefMonth(month: string, today: string, people: BriefPerson[], items: BriefItem[]): BriefMonth {
  const known = new Set(people.map((p) => p.id));
  const itemsByDay: Record<string, BriefItem[]> = {};
  const counts = new Map<string, number>(); // `${day}|${personId}`
  for (const it of items) {
    if (!known.has(it.requesterId) || !it.requestDay.startsWith(month)) continue;
    (itemsByDay[it.requestDay] ??= []).push(it);
    const key = `${it.requestDay}|${it.requesterId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const summary: BriefSummary[] = people.map((p) => ({ personId: p.id, weekdaysBriefed: 0, weekdaysElapsed: 0, briefs: 0 }));
  const weeks = buildMonthGrid(month, today).weeks.map((week) =>
    week.map((d): BriefDay => {
      const isWeekend = d.weekday >= 5;
      const isFuture = d.day > today;
      const elapsedWeekday = d.inMonth && !isWeekend && !isFuture;
      const perPerson = people.map((p, i) => {
        const count = d.inMonth ? counts.get(`${d.day}|${p.id}`) ?? 0 : 0;
        const s = summary[i];
        s.briefs += count;
        if (elapsedWeekday) {
          s.weekdaysElapsed += 1;
          if (count > 0) s.weekdaysBriefed += 1;
        }
        return { personId: p.id, count, state: dotState({ inMonth: d.inMonth, isWeekend, isFuture }, count) };
      });
      return { ...d, isWeekend, isFuture, perPerson };
    }),
  );
  return { weeks, summary, itemsByDay };
}
