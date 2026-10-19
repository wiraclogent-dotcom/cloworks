import type { CalActivity, MarketingStatus } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (day: string) => { const [y, m, d] = day.split("-").map(Number); return { y, m: MONTHS[m - 1], d }; };

export const STATUS_LABEL: Record<MarketingStatus, string> = { PLANNED: "Planned", CONFIRMED: "Confirmed", DONE: "Done", CANCELLED: "Cancelled" };

/** "15 Oct", "24–31 Oct", "30 Oct–2 Nov", "30 Dec 2026–2 Jan 2027". */
export function rangeLabel(startDay: string, endDay: string): string {
  const s = parts(startDay), e = parts(endDay);
  if (startDay === endDay) return `${s.d} ${s.m}`;
  if (s.y !== e.y) return `${s.d} ${s.m} ${s.y}–${e.d} ${e.m} ${e.y}`;
  if (s.m !== e.m) return `${s.d} ${s.m}–${e.d} ${e.m}`;
  return `${s.d}–${e.d} ${e.m}`;
}

/** Accessible name of a calendar bar: "Digital Ads: Payday flight Meta, 24–31 Oct, confirmed". */
export function activityLabel(divisionName: string, a: CalActivity): string {
  return `${divisionName}: ${a.title}, ${rangeLabel(a.startDay, a.endDay)}, ${STATUS_LABEL[a.status].toLowerCase()}`;
}
