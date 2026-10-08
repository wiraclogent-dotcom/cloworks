import { describe, it, expect } from "vitest";
import { workingDaysBetween } from "@/lib/kpi/workingDays";

describe("workingDaysBetween", () => {
  it("Fri 09:00 -> Mon 09:00 = 1", () => {
    expect(workingDaysBetween(new Date("2026-10-09T09:00:00Z"), new Date("2026-10-12T09:00:00Z"))).toBeCloseTo(1, 10);
  });
  it("same day 09:00 -> 15:00 = 0.25", () => {
    expect(workingDaysBetween(new Date("2026-10-07T09:00:00Z"), new Date("2026-10-07T15:00:00Z"))).toBeCloseTo(0.25, 10);
  });
  it("weekend-only span = 0", () => {
    expect(workingDaysBetween(new Date("2026-10-10T00:00:00Z"), new Date("2026-10-11T23:00:00Z"))).toBe(0);
  });
  it("full Mon -> next Mon = 5", () => {
    expect(workingDaysBetween(new Date("2026-10-05T00:00:00Z"), new Date("2026-10-12T00:00:00Z"))).toBeCloseTo(5, 10);
  });
  it("end before start = 0", () => {
    expect(workingDaysBetween(new Date("2026-10-07T15:00:00Z"), new Date("2026-10-07T09:00:00Z"))).toBe(0);
  });
});
