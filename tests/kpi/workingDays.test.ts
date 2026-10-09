import { describe, it, expect } from "vitest";
import { workingDaysBetween } from "@/lib/kpi/workingDays";

// The creative team works Monday to Saturday: only Sunday contributes 0.
describe("workingDaysBetween", () => {
  it("Fri 09:00Z -> Mon 09:00Z = 2 (Saturday counts, Sunday does not)", () => {
    expect(workingDaysBetween(new Date("2026-10-09T09:00:00Z"), new Date("2026-10-12T09:00:00Z"))).toBeCloseTo(2, 10);
  });
  it("same day 09:00 -> 15:00 = 0.25", () => {
    expect(workingDaysBetween(new Date("2026-10-07T09:00:00Z"), new Date("2026-10-07T15:00:00Z"))).toBeCloseTo(0.25, 10);
  });
  it("Sunday-only span = 0", () => {
    expect(workingDaysBetween(new Date("2026-10-11T00:00:00+07:00"), new Date("2026-10-11T23:00:00+07:00"))).toBe(0);
  });
  it("Saturday + Sunday = 1 (the Saturday)", () => {
    expect(workingDaysBetween(new Date("2026-10-10T00:00:00+07:00"), new Date("2026-10-11T23:00:00+07:00"))).toBeCloseTo(1, 10);
  });
  it("full Mon -> next Mon = 6", () => {
    expect(workingDaysBetween(new Date("2026-10-05T00:00:00+07:00"), new Date("2026-10-12T00:00:00+07:00"))).toBeCloseTo(6, 10);
  });
  it("end before start = 0", () => {
    expect(workingDaysBetween(new Date("2026-10-07T15:00:00Z"), new Date("2026-10-07T09:00:00Z"))).toBe(0);
  });

  it("Jakarta: Mon 00:00+07 -> Tue 00:00+07 = 1", () => {
    expect(workingDaysBetween(new Date("2026-10-05T00:00:00+07:00"), new Date("2026-10-06T00:00:00+07:00"))).toBeCloseTo(1, 10);
  });
  it("Jakarta: Sat 05:00+07 -> Sat 20:00+07 = 0.625", () => {
    expect(workingDaysBetween(new Date("2026-10-10T05:00:00+07:00"), new Date("2026-10-10T20:00:00+07:00"))).toBeCloseTo(0.625, 10);
  });
  it("Jakarta: Fri 09:00+07 -> Mon 09:00+07 = 2", () => {
    expect(workingDaysBetween(new Date("2026-10-09T09:00:00+07:00"), new Date("2026-10-12T09:00:00+07:00"))).toBeCloseTo(2, 10);
  });
  it("Jakarta: Sun 09:00+07 -> Mon 09:00+07 = 0.375 (only Monday's morning)", () => {
    expect(workingDaysBetween(new Date("2026-10-11T09:00:00+07:00"), new Date("2026-10-12T09:00:00+07:00"))).toBeCloseTo(0.375, 10);
  });
});
