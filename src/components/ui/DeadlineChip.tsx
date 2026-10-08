import { CalendarClock, CalendarX, Clock, TriangleAlert } from "lucide-react";
import { deadlineState, deadlineText } from "@/lib/deadline";
import type { Tone } from "@/lib/palette";
import { Chip } from "./Chip";

const ICON = { "aria-hidden": true, strokeWidth: 1.75 } as const;

/**
 * Deadline as a chip from `daysLeft` (Jakarta calendar days; null = no deadline):
 * overdue (red, "Overdue by 7 days"), due soon ≤ 2 days (amber, "1 day left" / "Due today"), on track (neutral).
 * Only meaningful for open requests: callers skip it for Done/Cancelled.
 */
export function DeadlineChip({ daysLeft, className }: { daysLeft: number | null; className?: string }) {
  const state = deadlineState(daysLeft);
  const tone: Tone = state === "overdue" ? "overdue" : state === "due-soon" ? "due-soon" : "tag-neutral";
  const icon = state === "overdue" ? <TriangleAlert {...ICON} /> : state === "due-soon" ? <Clock {...ICON} /> : state === "none" ? <CalendarX {...ICON} /> : <CalendarClock {...ICON} />;
  return <Chip tone={tone} icon={icon} data-deadline={state} className={`tabular-nums ${className ?? ""}`}>{deadlineText(daysLeft)}</Chip>;
}
