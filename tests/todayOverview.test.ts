import { describe, it, expect } from "vitest";
import { jakartaDayStart, greetingFor, summarySentence, todayOverview } from "@/lib/todayOverview";

describe("jakartaDayStart", () => {
  it("is midnight in Jakarta, which is 17:00 UTC the day before", () => {
    // 2026-10-08 10:00 Jakarta (= 03:00 UTC) belongs to the 8th.
    expect(jakartaDayStart(new Date("2026-10-08T03:00:00Z")).toISOString()).toBe("2026-10-07T17:00:00.000Z");
  });
  it("keeps a late-UTC instant on the Jakarta day it falls in", () => {
    // 2026-10-08 18:00 UTC = 2026-10-09 01:00 Jakarta.
    expect(jakartaDayStart(new Date("2026-10-08T18:00:00Z")).toISOString()).toBe("2026-10-08T17:00:00.000Z");
  });
});

describe("greetingFor", () => {
  it("uses the Jakarta hour, not the UTC hour", () => {
    expect(greetingFor(new Date("2026-10-08T00:30:00Z"))).toBe("Good morning");   // 07:30 Jakarta
    expect(greetingFor(new Date("2026-10-08T06:00:00Z"))).toBe("Good afternoon"); // 13:00 Jakarta
    expect(greetingFor(new Date("2026-10-08T12:00:00Z"))).toBe("Good evening");   // 19:00 Jakarta
  });
});

describe("summarySentence", () => {
  const o = (dueToday: number, overdue: number) => ({ open: 9, dueToday, overdue, doneToday: 0 });
  it("says nothing is due when both are zero", () => expect(summarySentence(o(0, 0))).toBe("Nothing is due today and nothing is overdue."));
  it("uses singular and plural correctly", () => {
    expect(summarySentence(o(1, 0))).toBe("1 request due today.");
    expect(summarySentence(o(0, 1))).toBe("1 request overdue.");
    expect(summarySentence(o(2, 3))).toBe("2 requests due today and 3 requests overdue.");
  });
});

describe("todayOverview", () => {
  it("counts open, due, late and done-today from the right tables and windows", async () => {
    const calls: unknown[] = [];
    const db = {
      request: { count: async (args: unknown) => { calls.push(args); return calls.length; } },
      statusEvent: { count: async (args: unknown) => { calls.push(args); return 40; } },
    };
    const now = new Date("2026-10-08T03:00:00Z");
    const result = await todayOverview(db as never, now);
    expect(result).toEqual({ open: 1, dueToday: 2, overdue: 3, doneToday: 40 });
    const start = new Date("2026-10-07T17:00:00.000Z");
    const end = new Date("2026-10-08T17:00:00.000Z");
    expect(calls[1]).toEqual({ where: { status: { in: ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK"] }, deadline: { gte: start, lt: end } } });
    expect(calls[2]).toEqual({ where: { status: { in: ["REQUESTED", "ON_PROGRESS", "FIRST_LOOK"] }, deadline: { lt: start } } });
    expect(calls[3]).toEqual({ where: { to: "DONE", at: { gte: start, lt: end } } });
  });
});
