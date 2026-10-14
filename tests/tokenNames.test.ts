import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { srcFiles } from "./helpers/srcFiles";

// A retired alias class: optional variant prefixes, a utility, then one of the three alias token names.
// Does not match `sidebar-foreground-secondary` or the raw `--surface` variables.
const RETIRED =
  /(?<![\w-])(?:[\w[\]=&-]+:)*(?:bg|text|border|ring|from|via|to|fill|stroke|outline|divide|decoration|caret|accent|shadow)-(?:surface-muted|surface|foreground-secondary)(?![\w-])/g;

describe("shadcn token names", () => {
  it("no class uses a retired alias", () => {
    const hits: string[] = [];
    for (const file of srcFiles("src", /\.(ts|tsx)$/)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(RETIRED)) hits.push(`${file}:${i + 1} ${m[0]}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it("globals.css no longer maps the aliases to Tailwind colours", () => {
    const css = readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");
    expect(css).not.toMatch(/--color-surface:/);
    expect(css).not.toMatch(/--color-surface-muted:/);
    expect(css).not.toMatch(/--color-foreground-secondary:/);
  });
});
