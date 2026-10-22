import { JAKARTA_OFFSET_MS } from "./workingDays";

// Timezone rule: all KPI calendar logic uses Asia/Jakarta (UTC+7, no DST).
const jakarta = (d: Date): Date => new Date(d.getTime() + JAKARTA_OFFSET_MS);

/** 'YYYY-MM' of the Jakarta calendar month the instant falls in. */
export function monthOf(d: Date): string {
  const j = jakarta(d);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Jakarta calendar day index; deadlines are dates, so done any time that day is on time. */
export function dayOf(d: Date): number {
  return Math.floor(jakarta(d).getTime() / 86_400_000);
}
