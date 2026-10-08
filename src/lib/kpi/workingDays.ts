const DAY_MS = 86_400_000;

/** Asia/Jakarta is UTC+7 with no DST. Shift an instant by this, then read getUTC* fields. */
export const JAKARTA_OFFSET_MS = 7 * 3600 * 1000;

/**
 * Fractional working days (Mon-Fri) between two instants.
 * Days are Asia/Jakarta calendar days (UTC+7); Saturday/Sunday contribute 0. end <= start gives 0.
 */
export function workingDaysBetween(start: Date, end: Date): number {
  const s = start.getTime() + JAKARTA_OFFSET_MS;
  const e = end.getTime() + JAKARTA_OFFSET_MS;
  if (e <= s) return 0;
  let total = 0;
  let dayStart = Math.floor(s / DAY_MS) * DAY_MS;
  while (dayStart < e) {
    const dow = new Date(dayStart).getUTCDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) {
      const overlap = Math.min(e, dayStart + DAY_MS) - Math.max(s, dayStart);
      if (overlap > 0) total += overlap / DAY_MS;
    }
    dayStart += DAY_MS;
  }
  return total;
}
