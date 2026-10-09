import type { TimelineRow } from "@/lib/requests";
import type { TimelineBar } from "@/lib/workload";
import { shortDay } from "@/lib/workload";
import { STATUS_LABEL } from "../status";

/** Screen-reader / tooltip text: "Banner, On progress, requested 1 Oct, due 14 Oct" (or "overdue since …", "no deadline"). */
export function barText(row: TimelineRow, bar: Pick<TimelineBar, "overdue" | "noDeadline">): string {
  const due = bar.noDeadline ? "no deadline" : bar.overdue ? `overdue since ${shortDay(row.deadlineDay!)}` : `due ${shortDay(row.deadlineDay!)}`;
  return `${row.title}, ${STATUS_LABEL[row.status]}, requested ${shortDay(row.requestDay)}, ${due}`;
}
