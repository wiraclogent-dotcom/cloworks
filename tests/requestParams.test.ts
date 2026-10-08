import { describe, it, expect } from "vitest";
import { parseParams, hrefWith, MAX_Q, MAX_ID } from "@/app/(app)/requests/params";

describe("parseParams limits", () => {
  it("caps q at 200 characters and trims", () => {
    expect(parseParams({ q: "  " + "a".repeat(500) }).q).toBe("a".repeat(MAX_Q));
    expect(parseParams({ q: "a".repeat(199) + " b" }).q).toBe("a".repeat(199));
    expect(parseParams({ q: "   " }).q).toBeUndefined();
  });
  it("ignores over-long id params and keeps normal ones", () => {
    const long = "x".repeat(MAX_ID + 1);
    const p = parseParams({ assignee: long, brand: long, division: long });
    expect([p.assigneeId, p.brandId, p.divisionId]).toEqual([undefined, undefined, undefined]);
    expect(parseParams({ assignee: "cmuz3o2t0000abc", brand: "x".repeat(MAX_ID) }).assigneeId).toBe("cmuz3o2t0000abc");
    expect(parseParams({ brand: "x".repeat(MAX_ID) }).brandId).toHaveLength(MAX_ID);
  });
  it("still validates enums", () => {
    expect(parseParams({ sort: "nope", dir: "desc", status: "DONE" })).toMatchObject({ sort: "deadline", dir: "desc", status: "DONE" });
  });
});

describe("parseParams motion", () => {
  it("whitelists yes/no, ignores everything else, and maps to the filter", async () => {
    const { toFilter } = await import("@/app/(app)/requests/params");
    expect(parseParams({ motion: "yes" }).motion).toBe("yes");
    expect(parseParams({ motion: "no" }).motion).toBe("no");
    for (const bad of ["YES", "1", "true", "", "x".repeat(100)]) expect(parseParams({ motion: bad }).motion).toBeUndefined();
    expect(parseParams({}).motion).toBeUndefined();
    expect(toFilter(parseParams({ motion: "yes" }), "u").needsMotion).toBe(true);
    expect(toFilter(parseParams({ motion: "no" }), "u").needsMotion).toBe(false);
    expect(toFilter(parseParams({}), "u").needsMotion).toBeUndefined();
  });
  it("is preserved in links (view, sort, page, more) and can be overridden", async () => {
    const { hrefWith } = await import("@/app/(app)/requests/params");
    const p = parseParams({ motion: "yes", view: "table" });
    expect(hrefWith(p, { page: "2" })).toBe("/requests?view=table&motion=yes&page=2");
    expect(hrefWith(p, { sort: "title" })).toContain("motion=yes");
    expect(hrefWith(p, { motion: undefined })).toBe("/requests?view=table");
  });
});

describe("calendar params", () => {
  const now = new Date("2026-10-08T05:00:00Z");
  it("parses view=calendar and month", () => {
    expect(parseParams({ view: "calendar", month: "2026-11" }, now)).toMatchObject({ view: "calendar", month: "2026-11" });
    expect(parseParams({}, now).month).toBe("2026-10");
    expect(parseParams({ view: "calendar", month: "bogus" }, now).month).toBe("2026-10");
  });
  it("hrefWith emits month only for the calendar view", () => {
    const cal = parseParams({ view: "calendar", month: "2026-11" }, now);
    expect(hrefWith(cal, { month: "2026-12" })).toBe("/requests?view=calendar&month=2026-12");
    expect(hrefWith(cal, { view: undefined })).toBe("/requests");
    expect(hrefWith(parseParams({ view: "table", month: "2026-11" }, now), {})).not.toContain("month");
    expect(hrefWith(parseParams({}, now), { status: "DONE" })).not.toContain("month");
  });
});
