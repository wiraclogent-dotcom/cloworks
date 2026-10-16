import type { TimelineRow } from "@/lib/requests";
import type { TimelineBar } from "@/lib/workload";
import { shortDay } from "@/lib/workload";
import { STATUS_LABEL } from "../status";

/** Screen-reader / tooltip text: "Banner, On progress, requested 1 Oct, due 14 Oct" (or "overdue since …", "no deadline"); a shared request adds ", shared with Bea" (everyone but the lane's owner). */
export function barText(row: TimelineRow, bar: Pick<TimelineBar, "overdue" | "noDeadline" | "shared">, laneOwnerId: string | null = null): string {
  const due = bar.noDeadline ? "no deadline" : bar.overdue ? `overdue since ${shortDay(row.deadlineDay!)}` : `due ${shortDay(row.deadlineDay!)}`;
  const base = `${row.title}, ${STATUS_LABEL[row.status]}, requested ${shortDay(row.requestDay)}, ${due}`;
  if (!bar.shared) return base;
  const others = row.assignees.filter((a) => a.id !== laneOwnerId).map((a) => a.name);
  return `${base}, shared with ${others.join(", ")}`;
}
