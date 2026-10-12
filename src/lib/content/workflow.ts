import type { ContentStatus } from "@prisma/client";

export type ContentEvent =
  | "save"
  | "submit"
  | "sendBack"
  | "approve"
  | "requestStarted"
  | "requestDone"
  | "requestReopened"
  | "requestCancelled";

// Allowed moves per status. "save" is handled separately in nextStatus.
const EDGES: Partial<Record<ContentStatus, Partial<Record<ContentEvent, ContentStatus>>>> = {
  DRAFT: { submit: "SUBMITTED" },
  CHANGES_REQUESTED: { submit: "SUBMITTED" },
  SUBMITTED: { sendBack: "CHANGES_REQUESTED", approve: "APPROVED" },
  // Linked request lifecycle; a cancelled request sends any linked post back to DRAFT.
  APPROVED: { requestStarted: "IN_PRODUCTION", requestDone: "DONE", requestCancelled: "DRAFT" },
  IN_PRODUCTION: { requestDone: "DONE", requestCancelled: "DRAFT" },
  DONE: { requestReopened: "IN_PRODUCTION", requestCancelled: "DRAFT" },
};

const EDITABLE: readonly ContentStatus[] = ["IDEA", "DRAFT", "CHANGES_REQUESTED"];

export function isEditable(s: ContentStatus): boolean {
  return EDITABLE.includes(s);
}

// Delete only before APPROVED.
export function canDelete(s: ContentStatus): boolean {
  return isEditable(s) || s === "SUBMITTED";
}

// null = not allowed.
export function nextStatus(
  from: ContentStatus,
  ev: ContentEvent,
  opts: { hasContent?: boolean } = {},
): ContentStatus | null {
  // An idea becomes a draft once it has content; other editable statuses keep their status.
  if (ev === "save") {
    if (from === "IDEA") return opts.hasContent ? "DRAFT" : "IDEA";
    return isEditable(from) ? from : null;
  }
  return EDGES[from]?.[ev] ?? null;
}
