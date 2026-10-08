import type { ProjectStatus, RequestStatus } from "@prisma/client";

const common = { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false } as const;

/**
 * Shape per status (never colour alone): empty circle, half, three-quarter, check, cross; projects add a dashed
 * circle (not started) and pause bars (on hold). Decorative: always render the status label next to it.
 */
export function StatusIcon({ status }: { status: RequestStatus | ProjectStatus }) {
  switch (status) {
    case "REQUESTED":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" /></svg>;
    case "NOT_STARTED":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" strokeDasharray="2.2 2" /></svg>;
    case "ON_PROGRESS":
    case "IN_PROGRESS":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" /><path d="M7 7V1.5A5.5 5.5 0 0 1 7 12.5Z" fill="currentColor" stroke="none" /></svg>;
    case "FIRST_LOOK":
    case "IN_REVIEW":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" /><path d="M7 7V1.5A5.5 5.5 0 1 1 1.5 7Z" fill="currentColor" stroke="none" /></svg>;
    case "DONE":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" /><path d="M4.4 7.2l1.9 1.9 3.4-3.8" /></svg>;
    case "CANCELLED":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" /><path d="M4.9 4.9l4.2 4.2M9.1 4.9l-4.2 4.2" /></svg>;
    case "ON_HOLD":
      return <svg {...common}><circle cx="7" cy="7" r="5.5" /><path d="M5.7 5v4M8.3 5v4" /></svg>;
  }
}
