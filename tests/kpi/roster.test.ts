import { describe, it, expect } from "vitest";
import { resolveRoster } from "@/lib/kpi/roster";

const sorted = (a: string[]) => [...a].sort();

describe("resolveRoster", () => {
  it("passes the automatic list through when there are no overrides", () => {
    expect(sorted(resolveRoster(["a", "b"], []))).toEqual(["a", "b"]);
  });
  it("adds people with included=true", () => {
    expect(sorted(resolveRoster(["a"], [{ userId: "c", included: true }]))).toEqual(["a", "c"]);
  });
  it("removes people with included=false", () => {
    expect(sorted(resolveRoster(["a", "b"], [{ userId: "b", included: false }]))).toEqual(["a"]);
  });
  it("lets a removal beat the automatic rule even for someone who would be added", () => {
    expect(resolveRoster(["a"], [{ userId: "a", included: false }])).toEqual([]);
  });
  it("is a no-op to add someone who is already automatic (no duplicates)", () => {
    expect(sorted(resolveRoster(["a", "b"], [{ userId: "a", included: true }]))).toEqual(["a", "b"]);
  });
  it("ignores removal of someone who is not on the list", () => {
    expect(resolveRoster(["a"], [{ userId: "z", included: false }])).toEqual(["a"]);
  });
});
