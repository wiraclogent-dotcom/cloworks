import type { RequestStatus } from "@prisma/client";

export const STATUS_LABEL: Record<RequestStatus, string> = {
  REQUESTED: "Requested",
  ON_PROGRESS: "On progress",
  FIRST_LOOK: "First look",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

/** Board column order. CANCELLED is a terminal side state and only gets a column when explicitly filtered. */
export const BOARD_STATUSES: readonly RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE"];

/** Shape per status (never colour alone): empty circle, half, three-quarter, check, cross. */
export function StatusIcon({ status }: { status: RequestStatus }) {
  const common = { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true, focusable: false } as const;
  switch (status) {
    case "REQUESTED":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" /></svg>;
    case "ON_PROGRESS":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" /><path d="M7 7V1.5A5.5 5.5 0 0 1 7 12.5Z" fill="currentColor" stroke="none" /></svg>;
    case "FIRST_LOOK":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" /><path d="M7 7V1.5A5.5 5.5 0 1 1 1.5 7Z" fill="currentColor" stroke="none" /></svg>;
    case "DONE":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" /><path d="M4.2 7.3l2 2 3.6-4" /></svg>;
    case "CANCELLED":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" /><path d="M4.7 4.7l4.6 4.6M9.3 4.7l-4.6 4.6" /></svg>;
  }
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      <StatusIcon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Plain-language deadline text. Overdue and due-today carry a text label, not just styling. */
export function deadlineText(days: number | null): string {
  if (days === null) return "No deadline";
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  if (days > 1) return `${days} days left`;
  return days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days`;
}

/** Statuses a card/detail "Move to…" menu may offer; callers filter by canTransition. */
export const MOVE_TARGETS: readonly RequestStatus[] = [...BOARD_STATUSES, "CANCELLED"];
