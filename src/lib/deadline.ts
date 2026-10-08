/** Plain-language deadline text. Overdue and due-today carry a text label, not just styling. */
export function deadlineText(days: number | null): string {
  if (days === null) return "No deadline";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  if (days > 1) return `${days} days left`;
  return days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days`;
}

export type DeadlineState = "none" | "overdue" | "due-soon" | "on-track";

/** Due soon = today up to 2 days left (spec); overdue = past the deadline. */
export function deadlineState(days: number | null): DeadlineState {
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days <= 2) return "due-soon";
  return "on-track";
}
