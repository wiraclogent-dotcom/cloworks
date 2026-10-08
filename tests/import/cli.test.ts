import { describe, it, expect } from "vitest";
import { parseArgs } from "@/lib/import/cliArgs";

describe("parseArgs", () => {
  it("dry-run by default", () => {
    expect(parseArgs(["a.csv"])).toEqual({ requestsPath: "a.csv", socmedPath: undefined, apply: false });
  });
  it("--apply and socmed", () => {
    expect(parseArgs(["a.csv", "b.csv", "--apply"])).toEqual({ requestsPath: "a.csv", socmedPath: "b.csv", apply: true });
    expect(parseArgs(["--apply", "a.csv"]).apply).toBe(true);
  });
  it("errors", () => {
    expect(() => parseArgs([])).toThrow(/requests\.csv/);
    expect(() => parseArgs(["--apply"])).toThrow(/requests\.csv/);
    expect(() => parseArgs(["a", "b", "c"])).toThrow(/too many/i);
    expect(() => parseArgs(["a", "--force"])).toThrow(/unknown option/i);
  });
});
