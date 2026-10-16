import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Built from parts so a global rename of the old name never rewrites this test.
const OLD_NAME = new RegExp(["Clo", "works"].join(""));

/** Every file under `dir` (recursive) whose name ends with one of `extensions`. */
function filesUnder(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return filesUnder(path, extensions);
    return extensions.some((ext) => name.endsWith(ext)) ? [path] : [];
  });
}

function offendersIn(dir: string, extensions: string[]): string[] {
  return filesUnder(join(process.cwd(), dir), extensions).filter((path) =>
    OLD_NAME.test(readFileSync(path, "utf8")),
  );
}

describe("brand name", () => {
  it("no source file uses the old product name", () => {
    expect(offendersIn("src", [".ts", ".tsx", ".css"])).toEqual([]);
  });

  it("no help article uses the old product name", () => {
    expect(offendersIn("content", [".md"])).toEqual([]);
  });
});
