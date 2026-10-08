import { describe, it, expect } from "vitest";
import { parseParams, MAX_Q, MAX_ID } from "@/app/(app)/requests/params";

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
