const DASH = "—";

/** Whole-number percent of a 0..1 ratio, e.g. 0.666 -> "67%". null -> em dash. */
export function formatPercent(ratio: number | null): string {
  return ratio === null ? DASH : `${Math.round(ratio * 100)}%`;
}

/** Whole percent for progress (not clamped: 1.23 -> 123). */
export function progressPercent(ratio: number | null): number | null {
  return ratio === null ? null : Math.round(ratio * 100);
}

/** Working days with one decimal. */
export function formatDays(days: number | null): string {
  return days === null ? DASH : days.toFixed(1);
}

export function formatCount(n: number | null): string {
  return n === null ? DASH : new Intl.NumberFormat("en-US").format(n);
}
