import { MarketingError } from "./errors";
import type { MarketingViewer } from "./types";

/** Admins edit every division; anyone else only the divisions they lead (DivisionLead), whatever their appRole. */
export function canEditDivision(viewer: MarketingViewer, divisionId: string, leadDivisionIds: readonly string[]): boolean {
  return viewer.appRole === "ADMIN" || leadDivisionIds.includes(divisionId);
}

/** Product focus and announcements. */
export function canManageMonth(viewer: MarketingViewer): boolean {
  return viewer.appRole === "ADMIN";
}

/**
 * Saving an activity into `toDivisionId` (from `fromDivisionId` when it already exists): the target must be on the
 * calendar, and the viewer must be able to edit both the old and the new division.
 */
export function assertCanSaveActivity(
  viewer: MarketingViewer, leadDivisionIds: readonly string[], calendarDivisionIds: readonly string[], fromDivisionId: string | null, toDivisionId: string,
): void {
  const allowed = canEditDivision(viewer, toDivisionId, leadDivisionIds) && (fromDivisionId === null || canEditDivision(viewer, fromDivisionId, leadDivisionIds));
  if (!allowed) throw new MarketingError("FORBIDDEN", "You can only edit activities of divisions you lead.");
  if (!calendarDivisionIds.includes(toDivisionId)) {
    throw new MarketingError("INVALID", "Check the highlighted fields.", { divisionId: "This division is not on the Marketing Calendar." });
  }
}
