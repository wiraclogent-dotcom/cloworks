import { describe, it, expect } from "vitest";
import { relativeTime } from "@/lib/relativeTime";

const now = new Date("2026-10-10T05:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("under a minute is just now", () => expect(relativeTime(ago(59_000), now)).toBe("just now"));
  it("minutes", () => expect(relativeTime(ago(5 * MIN), now)).toBe("5m ago"));
  it("hours", () => expect(relativeTime(ago(2 * HOUR + 10 * MIN), now)).toBe("2h ago"));
  it("days under a week", () => expect(relativeTime(ago(3 * DAY), now)).toBe("3d ago"));
  it("a week or more shows the Jakarta date", () => expect(relativeTime(ago(8 * DAY), now)).toBe("2 Oct"));
  it("a future time (clock skew) is just now", () => expect(relativeTime(new Date(now.getTime() + 5 * MIN), now)).toBe("just now"));
});
