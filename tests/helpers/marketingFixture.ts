import type { MarketingMonthData } from "@/lib/marketing/types";

/** October 2026 on the Marketing Calendar, as in the spec mockup (today 19 Oct). */
const at = "2026-10-18T03:00:00.000Z";
export const OCTOBER: MarketingMonthData = {
  month: "2026-10", today: "2026-10-19",
  divisions: [
    { id: "brand", name: "Brand", tone: "div-1" }, { id: "ads", name: "Digital Ads", tone: "div-2" },
    { id: "kol", name: "KOL", tone: "div-3" }, { id: "social", name: "Social Media", tone: "div-4" },
  ],
  activities: [
    { id: "a1", divisionId: "brand", title: "Rebranding launch", startDay: "2026-10-05", endDay: "2026-10-09", status: "CONFIRMED", updatedByName: "Wira", updatedAt: at },
    { id: "a2", divisionId: "brand", title: "Brand photoshoot", startDay: "2026-10-21", endDay: "2026-10-21", status: "PLANNED", updatedByName: "Wira", updatedAt: at },
    { id: "a3", divisionId: "ads", title: "Payday flight Meta", startDay: "2026-10-24", endDay: "2026-10-31", status: "CONFIRMED", updatedByName: "Wira", updatedAt: at },
    { id: "a4", divisionId: "kol", title: "KOL batch 3 posting", startDay: "2026-10-08", endDay: "2026-10-14", status: "DONE", updatedByName: "Rifqy", updatedAt: at },
    { id: "a5", divisionId: "social", title: "Halloween series", startDay: "2026-10-27", endDay: "2026-10-31", status: "CANCELLED", updatedByName: "Fafa", updatedAt: at },
  ],
  announcements: [
    { id: "n1", body: "Inbound China (Pitbond)", startDay: "2026-10-22", endDay: "2026-10-24" },
    { id: "n2", body: "Budget Q4 approved", startDay: null, endDay: null },
  ],
  productFocus: null, editableDivisionIds: [], canManageMonth: false,
};

