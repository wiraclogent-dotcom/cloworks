import type { RequestStatus } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/statusLabels";

export { STATUS_LABEL };
export { deadlineText } from "@/lib/deadline";
export { StatusIcon } from "./ui/StatusIcon";
/** Status chip (tint + icon + label). Kept under the old name for existing callers; new code imports StatusChip from ./ui/StatusChip. */
export { StatusChip as StatusBadge } from "./ui/StatusChip";
/** Needs-motion chip. Kept under the old name for existing callers; new code imports NeedsMotionChip from ./ui/NeedsMotionChip. */
export { NeedsMotionChip as NeedsMotionBadge } from "./ui/NeedsMotionChip";

/** Board column order. CANCELLED is a terminal side state and only gets a column when explicitly filtered. */
export const BOARD_STATUSES: readonly RequestStatus[] = ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK", "DONE"];

/** Statuses a card/detail "Move to…" menu may offer; callers filter by canTransition. */
export const MOVE_TARGETS: readonly RequestStatus[] = [...BOARD_STATUSES, "CANCELLED"];
