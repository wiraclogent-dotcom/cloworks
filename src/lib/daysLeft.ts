import { jakartaDate } from "./createRequest";

const DAY_MS = 24 * 3600 * 1000;

/** Whole Jakarta-calendar days from today to the deadline: 0 = today, 1 = tomorrow, -1 = yesterday. null when no deadline. */
export function daysLeft(deadline: Date | null, now: Date = new Date()): number | null {
  if (!deadline) return null;
  const a = Date.parse(`${jakartaDate(deadline)}T00:00:00Z`);
  const b = Date.parse(`${jakartaDate(now)}T00:00:00Z`);
  return Math.round((a - b) / DAY_MS);
}
