import { JAKARTA_OFFSET_MS } from "./workingDays";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isValidMonth(s: string): boolean {
  return MONTH_RE.test(s);
}

/** 'YYYY-MM' of an instant on the Asia/Jakarta calendar (UTC+7, no DST). */
export function jakartaMonth(d: Date): string {
  const j = new Date(d.getTime() + JAKARTA_OFFSET_MS);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** [start, end) of a Jakarta calendar month as UTC instants (Jakarta midnights). */
export function monthBounds(month: string): { start: Date; end: Date } {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`Invalid month: ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  return {
    start: new Date(Date.UTC(y, mo, 1) - JAKARTA_OFFSET_MS),
    end: new Date(Date.UTC(y, mo + 1, 1) - JAKARTA_OFFSET_MS),
  };
}

/** The `n` months ending at `end` (inclusive), oldest first. */
export function trailingMonths(end: string, n: number): string[] {
  const m = MONTH_RE.exec(end);
  if (!m) throw new Error(`Invalid month: ${end}`);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, mo - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function monthLabel(month: string): string {
  const { start } = monthBounds(month);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "Asia/Jakarta" }).format(start);
}
