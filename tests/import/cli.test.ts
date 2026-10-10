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

import { runImport } from "@/lib/import/run";
import { REQ_HEADERS, SOC_HEADERS, reqRow, socRow, users, brands, divisions } from "./fixtures";
import { vi } from "vitest";

describe("runImport with swapped files", () => {
  const csv = (h: string[], r: Record<string, string>) => `${h.join(",")}\n${h.map((k) => r[k] ?? "").join(",")}\n`;
  it("never reaches applyImport, even with --apply", async () => {
    const files: Record<string, string> = { "req.csv": csv(REQ_HEADERS, reqRow({})), "soc.csv": csv(SOC_HEADERS, socRow({})) };
    const db = { user: { findMany: async () => users }, brand: { findMany: async () => brands }, division: { findMany: async () => divisions }, $queryRaw: async () => [] } as never;
    const apply = vi.fn();
    const deps = { apply, readFile: (p: string) => files[p], exists: () => true, log: () => {} };
    await expect(runImport(db, "clogent", { requestsPath: "soc.csv", socmedPath: "req.csv", apply: true }, deps)).rejects.toThrow(/SocMed/);
    expect(apply).not.toHaveBeenCalled();
    await runImport(db, "clogent", { requestsPath: "req.csv", socmedPath: "soc.csv", apply: false }, deps);
    expect(apply).not.toHaveBeenCalled();
  });
});
