import type { AppRole } from "@prisma/client";
import type { DivisionTone } from "../palette";

/** Client-safe shapes shared by the Marketing Calendar's query, actions and components (spec 2026-10-19). */

export type MarketingStatus = "PLANNED" | "CONFIRMED" | "DONE" | "CANCELLED";
export const MARKETING_STATUSES: readonly MarketingStatus[] = ["PLANNED", "CONFIRMED", "DONE", "CANCELLED"];

export type MarketingViewer = { id: string; appRole: AppRole };

export type CalDivision = { id: string; name: string; tone: DivisionTone };
/** Days are Jakarta `YYYY-MM-DD`; `updatedAt` is an ISO timestamp. */
export type CalActivity = {
  id: string; divisionId: string; title: string; startDay: string; endDay: string; status: MarketingStatus; updatedByName: string; updatedAt: string;
};
export type CalAnnouncement = { id: string; body: string; startDay: string | null; endDay: string | null };

export type MarketingMonthData = {
  month: string; today: string;
  divisions: CalDivision[]; activities: CalActivity[]; announcements: CalAnnouncement[];
  productFocus: string | null;
  /** Calendar divisions the viewer may add to and edit (all of them for an admin). */
  editableDivisionIds: string[];
  canManageMonth: boolean;
};

export type ActivityInput = { title: string; divisionId: string; startDay: string; endDay: string; status: string };
export type AnnouncementInput = { month: string; body: string; startDay: string | null; endDay: string | null };
