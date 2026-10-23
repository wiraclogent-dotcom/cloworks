const TZ = "Asia/Jakarta";
const dayKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ });
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });

/** Note list time, in Jakarta: today "09:41", the six days before "Mon", older "12 Oct 2026". */
export function formatNoteTime(d: Date, now: Date): string {
  const days = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(d))) / 86_400_000);
  if (days === 0) return timeFmt.format(d);
  if (days > 0 && days < 7) return weekdayFmt.format(d);
  return dateFmt.format(d);
}

/** "23 Oct 2026, 09:41" (Jakarta), for the editor's "Edited …" line. */
export function formatEdited(d: Date): string {
  return `${dateFmt.format(d)}, ${timeFmt.format(d)}`;
}
