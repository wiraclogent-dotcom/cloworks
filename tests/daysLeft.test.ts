import { describe, it, expect } from "vitest";
import { daysLeft } from "@/lib/daysLeft";

// Jakarta is UTC+7: 2026-10-08 00:00 Jakarta == 2026-10-07T17:00:00Z
const deadline = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);

describe("daysLeft (Jakarta calendar days)", () => {
  const now = new Date("2026-10-08T03:00:00Z"); // 10:00 Jakarta, 8 Oct
  it("today = 0", () => expect(daysLeft(deadline("2026-10-08"), now)).toBe(0));
  it("tomorrow = 1", () => expect(daysLeft(deadline("2026-10-09"), now)).toBe(1));
  it("yesterday = -1", () => expect(daysLeft(deadline("2026-10-07"), now)).toBe(-1));
  it("null = null", () => expect(daysLeft(null, now)).toBeNull());
  it("flips to the next Jakarta day at 17:00Z", () => {
    expect(daysLeft(deadline("2026-10-08"), new Date("2026-10-08T16:59:59Z"))).toBe(0);
    expect(daysLeft(deadline("2026-10-08"), new Date("2026-10-08T17:00:00Z"))).toBe(-1);
    expect(daysLeft(deadline("2026-10-09"), new Date("2026-10-08T17:00:00Z"))).toBe(0);
  });
  it("counts across month boundaries", () => expect(daysLeft(deadline("2026-11-01"), now)).toBe(24));
});
