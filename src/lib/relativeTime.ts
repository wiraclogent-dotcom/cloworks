const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" });

/** "just now", "5m ago", "2h ago", "3d ago", then the Jakarta date ("2 Oct"). Future times read as "just now". */
export function relativeTime(date: Date, now: Date): string {
  const s = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return dayFmt.format(date);
}
