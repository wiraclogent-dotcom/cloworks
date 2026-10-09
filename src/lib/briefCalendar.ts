import type { RequestStatus } from "@prisma/client";
import { buildMonthGrid, type CalendarDay } from "./calendar";

/**
 * Brief calendar month model (spec 2026-10-10): for each day, did each social media person submit at least one
 * request? Pure and client-safe; days are Jakarta `YYYY-MM-DD` strings. The team works Monday to Saturday; Sunday is
 * the only day off.
 */

export type BriefPerson = { id: string; name: string };
export type BriefItem = { id: string; title: string; requesterId: string; requestDay: string; typeName: string; status: RequestStatus };
export type DotState = "sent" | "missed" | "none";
export type BriefDay = CalendarDay & { isDayOff: boolean; isFuture: boolean; perPerson: { personId: string; count: number; state: DotState }[] };
export type BriefSummary = { personId: string; workdaysBriefed: number; workdaysElapsed: number; briefs: number };
export type BriefMonth = { weeks: BriefDay[][]; summary: BriefSummary[]; itemsByDay: Record<string, BriefItem[]> };

/** Days off (Sunday) and future days are never "missed"; out-of-month days show nothing. */
export function dotState(day: { inMonth: boolean; isDayOff: boolean; isFuture: boolean }, count: number): DotState {
  if (!day.inMonth) return "none";
  if (count > 0) return "sent";
  return day.isDayOff || day.isFuture ? "none" : "missed";
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

  const summary: BriefSummary[] = people.map((p) => ({ personId: p.id, workdaysBriefed: 0, workdaysElapsed: 0, briefs: 0 }));
  const weeks = buildMonthGrid(month, today).weeks.map((week) =>
    week.map((d): BriefDay => {
      const isDayOff = d.weekday === 6; // Sunday
      const isFuture = d.day > today;
      const elapsedWorkday = d.inMonth && !isDayOff && !isFuture;
      const perPerson = people.map((p, i) => {
        const count = d.inMonth ? counts.get(`${d.day}|${p.id}`) ?? 0 : 0;
        const s = summary[i];
        s.briefs += count;
        if (elapsedWorkday) {
          s.workdaysElapsed += 1;
          if (count > 0) s.workdaysBriefed += 1;
        }
        return { personId: p.id, count, state: dotState({ inMonth: d.inMonth, isDayOff, isFuture }, count) };
      });
      return { ...d, isDayOff, isFuture, perPerson };
    }),
  );
  return { weeks, summary, itemsByDay };
}
