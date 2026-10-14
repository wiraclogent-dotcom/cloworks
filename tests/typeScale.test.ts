import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { srcFiles } from "./helpers/srcFiles";

const SUB_12 = /text-\[(?:[0-9]|1[01])px\]/g;
// Landing is marketing art, and avatar initials sit in a 24-28px circle: both may go below 12px.
const ALLOWED = (file: string) => file.includes(`${path.sep}components${path.sep}landing${path.sep}`) || file.endsWith(path.join("components", "ui", "Avatar.tsx"));

function hits(re: RegExp, files: string[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      for (const m of line.matchAll(re)) out.push(`${file}:${i + 1} ${m[0]}`);
    });
  }
  return out;
}

describe("type scale", () => {
  it("no arbitrary font size below 12px outside the allowlist", () => {
    const files = srcFiles("src", /\.tsx$/).filter((f) => !ALLOWED(f));
    expect(hits(SUB_12, files)).toEqual([]);
  });

  it("13px is the text-compact token", () => {
    expect(hits(/text-\[13px\]/g, srcFiles("src", /\.(ts|tsx)$/))).toEqual([]);
    const css = readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");
    expect(css).toMatch(/--text-compact:\s*0\.8125rem/);
    expect(css).toMatch(/--text-compact--line-height:/);
  });
});
