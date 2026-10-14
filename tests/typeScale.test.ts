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

  it("arbitrary sizes of 12px and up only for display text in the places the README lists", () => {
    // README "Type": page title (PageHeader), KPI values (KpiTile), the sidebar wordmark (AppFrame) and the sign-in
    // family (auth components and the standalone join / reset / change-password pages). Everything else uses the scale.
    const DISPLAY = ["components/ui/PageHeader.tsx", "components/ui/KpiTile.tsx", "components/shell/AppFrame.tsx",
      "components/auth/", "app/join/", "app/reset/", "app/change-password/"].map((p) => p.split("/").join(path.sep));
    const allowed = (f: string) => ALLOWED(f) || DISPLAY.some((p) => f.includes(`${path.sep}${p}`));
    const files = srcFiles("src", /\.(ts|tsx)$/).filter((f) => !allowed(f));
    expect(hits(/text-\[[0-9.]+(?:px|rem)\]/g, files)).toEqual([]);
  });

  it("13px is the text-compact token", () => {
    expect(hits(/text-\[13px\]/g, srcFiles("src", /\.(ts|tsx)$/))).toEqual([]);
    const css = readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");
    expect(css).toMatch(/--text-compact:\s*0\.8125rem/);
    expect(css).toMatch(/--text-compact--line-height:/);
  });
});
