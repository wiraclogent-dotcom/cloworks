import type { PrismaClient, RequestStatus } from "@prisma/client";
import { jakartaDate } from "./createRequest";

const DAY_MS = 86_400_000;

/** Requests that still need work (the board's first three columns). */
export const OPEN_STATUSES: RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK"];

export type TodayOverview = { open: number; dueToday: number; overdue: number; doneToday: number };

/** Start of the Jakarta calendar day that contains `now`. Jakarta has no DST, so a fixed +07:00 offset is exact. */
export function jakartaDayStart(now: Date): Date {
  return new Date(`${jakartaDate(now)}T00:00:00+07:00`);
}

/** Greeting for the Jakarta time of day (the team works in Jakarta, whatever the server's timezone). */
export function greetingFor(now: Date): "Good morning" | "Good afternoon" | "Good evening" {
  const hour = (now.getUTCHours() + 7) % 24;
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export type DayPeriod = "morning" | "afternoon" | "evening";

/** Time of day for the welcome card's icon and illustration; same boundaries as greetingFor. */
export function dayPeriodFor(now: Date): DayPeriod {
  const g = greetingFor(now);
  return g === "Good morning" ? "morning" : g === "Good afternoon" ? "afternoon" : "evening";
}

/** "1 request" / "3 requests". */
function requests(n: number): string {
  return `${n} ${n === 1 ? "request" : "requests"}`;
}

/** One plain sentence for the welcome card, e.g. "2 requests due today and 1 request overdue." */
export function summarySentence(o: TodayOverview): string {
  if (o.dueToday === 0 && o.overdue === 0) return "Nothing is due today and nothing is overdue.";
  if (o.overdue === 0) return `${requests(o.dueToday)} due today.`;
  if (o.dueToday === 0) return `${requests(o.overdue)} overdue.`;
  return `${requests(o.dueToday)} due today and ${requests(o.overdue)} overdue.`;
}

/**
 * Counts for the day: open work, what is due today, what is already late, and what was marked Done today
 * (from the status history, so a request finished earlier today counts even if it has moved since).
 */
export async function todayOverview(db: Pick<PrismaClient, "request" | "statusEvent">, now: Date = new Date()): Promise<TodayOverview> {
  const start = jakartaDayStart(now);
  const end = new Date(start.getTime() + DAY_MS);
  const [open, dueToday, overdue, doneToday] = await Promise.all([
    db.request.count({ where: { status: { in: OPEN_STATUSES } } }),
    db.request.count({ where: { status: { in: OPEN_STATUSES }, deadline: { gte: start, lt: end } } }),
    db.request.count({ where: { status: { in: OPEN_STATUSES }, deadline: { lt: start } } }),
    db.statusEvent.count({ where: { to: "DONE", at: { gte: start, lt: end } } }),
  ]);
  return { open, dueToday, overdue, doneToday };
}
