import type { RequestStatus } from "@prisma/client";

/** Plain-TS status labels shared by the UI and notifications (no client code). */
export const STATUS_LABEL: Record<RequestStatus, string> = {
  REQUESTED: "Requested",
  ON_PROGRESS: "On progress",
  FIRST_LOOK: "First look",
  DONE: "Done",
  CANCELLED: "Cancelled",
};
