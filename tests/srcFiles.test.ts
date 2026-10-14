import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { srcFiles, jsxOpenings } from "./helpers/srcFiles";

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "srcfiles-"));
  mkdirSync(path.join(tmp, "a/node_modules"), { recursive: true });
  mkdirSync(path.join(tmp, ".next"));
  writeFileSync(path.join(tmp, "a/x.tsx"), `export const X = () => (\n  <div>\n    <Button variant="ghost" onClick={go}>Hi</Button>\n    <Button {...rest} />\n    <Button.Sub a="1" />\n  </div>\n);\n`);
  writeFileSync(path.join(tmp, "a/y.ts"), "export const y = 1;\n");
  writeFileSync(path.join(tmp, "a/node_modules/skip.ts"), "");
  writeFileSync(path.join(tmp, ".next/skip.ts"), "");
  writeFileSync(path.join(tmp, "a/notes.md"), "");
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("srcFiles", () => {
  it("walks recursively, skips node_modules and .next, filters by extension", () => {
    expect(srcFiles(tmp).map((f) => path.relative(tmp, f))).toEqual(["a/x.tsx", "a/y.ts"]);
    expect(srcFiles(tmp, /\.md$/).map((f) => path.relative(tmp, f))).toEqual(["a/notes.md"]);
  });
});

describe("jsxOpenings", () => {
  it("lists attribute names with 1-based lines and marks spreads as '...'", () => {
    const rows = jsxOpenings("Button", srcFiles(tmp)).map((r) => ({ line: r.line, attrs: r.attrs }));
    expect(rows).toEqual([
      { line: 3, attrs: ["variant", "onClick"] },
      { line: 4, attrs: ["..."] },
    ]);
  });
  it("matches dotted tag names exactly", () => {
    expect(jsxOpenings("Button.Sub", srcFiles(tmp)).map((r) => r.attrs)).toEqual([["a"]]);
  });
});
