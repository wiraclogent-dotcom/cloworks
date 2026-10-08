import { describe, it, expect } from "vitest";
import { buildCalendarAnnouncements, CALENDAR_DND_ID, CALENDAR_SR_INSTRUCTIONS } from "../src/lib/calendarA11y";

const a = buildCalendarAnnouncements((id) => (id === "r1" ? "X" : undefined));
describe("calendar announcements", () => {
  it("exports constants", () => {
    expect(CALENDAR_DND_ID).toBe("request-calendar");
    expect(CALENDAR_SR_INSTRUCTIONS).toContain("arrow keys to move between days");
  });
  it("announces start, over, end, cancel", () => {
    expect(a.onDragStart({ active: { id: "r1" } })).toBe("Picked up “X”. Use the arrow keys to move between days.");
    expect(a.onDragOver({ active: { id: "r1" }, over: { id: "2026-10-14" } })).toBe("“X” is over Wednesday 14 October.");
    expect(a.onDragEnd({ active: { id: "r1" }, over: { id: "2026-10-14" } })).toBe("“X” moved to Wednesday 14 October.");
    expect(a.onDragEnd({ active: { id: "r1" }, over: null })).toBe("“X” was dropped outside the calendar. Nothing changed.");
    expect(a.onDragCancel({ active: { id: "r1" } })).toBe("Move cancelled. “X” stays where it was.");
  });
  it("falls back to Request", () => {
    expect(a.onDragStart({ active: { id: "zz" } })).toContain("“Request”");
  });
});
