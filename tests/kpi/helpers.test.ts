import { describe, it, expect } from "vitest";
import { isValidMonth, jakartaMonth, monthBounds, trailingMonths, monthLabel } from "@/lib/kpi/months";
import { formatPercent, formatDays, formatCount, progressPercent } from "@/lib/kpi/format";
import { parseMonthParam, parseUserParam, resolveSubject } from "@/app/(app)/dashboard/params";

describe("months", () => {
  it("validates YYYY-MM with real month", () => {
    for (const ok of ["2026-10", "2026-01", "2026-12"]) expect(isValidMonth(ok)).toBe(true);
    for (const bad of ["2026-13", "2026-00", "abc", "2026-1", "26-10", "2026-10-01", " 2026-10", ""]) expect(isValidMonth(bad)).toBe(false);
  });
  it("jakartaMonth uses UTC+7", () => {
    expect(jakartaMonth(new Date("2026-09-30T16:59:59Z"))).toBe("2026-09");
    expect(jakartaMonth(new Date("2026-09-30T17:00:00Z"))).toBe("2026-10");
  });
  it("monthBounds are Jakarta midnights", () => {
    const b = monthBounds("2026-10");
    expect(b.start.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-10-31T17:00:00.000Z");
    expect(monthBounds("2026-12").end.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });
  it("trailingMonths ends at the month, oldest first, crossing years", () => {
    expect(trailingMonths("2026-02", 6)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("monthLabel", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
  });
});

describe("format", () => {
  it("whole percents", () => {
    expect(formatPercent(0.666)).toBe("67%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(null)).toBe("—");
  });
  it("progressPercent is unclamped and whole", () => {
    expect(progressPercent(0.06)).toBe(6);
    expect(progressPercent(1.234)).toBe(123);
    expect(progressPercent(null)).toBeNull();
  });
  it("days with one decimal", () => {
    expect(formatDays(2)).toBe("2.0");
    expect(formatDays(1.26)).toBe("1.3");
    expect(formatDays(null)).toBe("—");
  });
  it("counts", () => {
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(null)).toBe("—");
  });
});

describe("dashboard params", () => {
  const now = new Date("2026-10-08T03:00:00Z");
  it("defaults to the current Jakarta month", () => {
    expect(parseMonthParam(undefined, now)).toBe("2026-10");
    expect(parseMonthParam(undefined, new Date("2026-09-30T20:00:00Z"))).toBe("2026-10");
  });
  it("whitelists the format", () => {
    expect(parseMonthParam("2026-03", now)).toBe("2026-03");
    expect(parseMonthParam("2026-13", now)).toBe("2026-10");
    expect(parseMonthParam("abc", now)).toBe("2026-10");
    expect(parseMonthParam(["2026-05", "2026-06"], now)).toBe("2026-05");
    expect(parseMonthParam(["abc", "2026-06"], now)).toBe("2026-10");
  });
  it("user param is sanitized", () => {
    expect(parseUserParam("cabc123")).toBe("cabc123");
    expect(parseUserParam(["u1", "u2"])).toBe("u1");
    expect(parseUserParam("a b/../c")).toBeUndefined();
    expect(parseUserParam("")).toBeUndefined();
    expect(parseUserParam("x".repeat(100))).toBeUndefined();
  });
  it("resolveSubject honours user= only for dashboard.team", () => {
    expect(resolveSubject({ id: "me", appRole: "LEAD" }, "other")).toBe("other");
    expect(resolveSubject({ id: "me", appRole: "ADMIN" }, "other")).toBe("other");
    expect(resolveSubject({ id: "me", appRole: "CREATIVE" }, "other")).toBe("me");
    expect(resolveSubject({ id: "me", appRole: "REQUESTER" }, "other")).toBe("me");
    expect(resolveSubject({ id: "me", appRole: "LEAD" }, undefined)).toBe("me");
  });
});
