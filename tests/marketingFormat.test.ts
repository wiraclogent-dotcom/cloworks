import { describe, it, expect } from "vitest";
import { STATUS_LABEL, activityLabel, rangeLabel } from "@/lib/marketing/format";
import type { CalActivity } from "@/lib/marketing/types";

const a: CalActivity = { id: "a", divisionId: "ads", title: "Payday flight Meta", startDay: "2026-10-24", endDay: "2026-10-31", status: "CONFIRMED", updatedByName: "Wira", updatedAt: "2026-10-19T03:00:00.000Z" };

describe("marketing labels", () => {
  it("formats ranges", () => {
    expect(rangeLabel("2026-10-24", "2026-10-31")).toBe("24–31 Oct");
    expect(rangeLabel("2026-10-15", "2026-10-15")).toBe("15 Oct");
    expect(rangeLabel("2026-10-30", "2026-11-02")).toBe("30 Oct–2 Nov");
    expect(rangeLabel("2026-12-30", "2027-01-02")).toBe("30 Dec 2026–2 Jan 2027");
  });
  it("labels statuses", () => expect(STATUS_LABEL).toEqual({ PLANNED: "Planned", CONFIRMED: "Confirmed", DONE: "Done", CANCELLED: "Cancelled" }));
  it("builds the bar label", () => {
    expect(activityLabel("Digital Ads", a)).toBe("Digital Ads: Payday flight Meta, 24–31 Oct, confirmed");
    expect(activityLabel("Social Media", { ...a, title: "IG Live", startDay: "2026-10-15", endDay: "2026-10-15", status: "PLANNED" })).toBe("Social Media: IG Live, 15 Oct, planned");
  });
});
