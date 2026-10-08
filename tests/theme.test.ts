import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { contrastRatio } from "@/lib/contrast";

const css = fs.readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");

/** Resolve a `:root` custom property, following var() references. */
function token(name: string): string {
  const root = css.slice(css.indexOf(":root"));
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(root);
  if (!m) throw new Error(`Token ${name} not found`);
  const v = m[1].trim();
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? token(ref[1]) : v;
}

describe("brand theme", () => {
  it("defines the four brand colors", () => {
    expect(token("--brand-deep-blue").toLowerCase()).toBe("#09426d");
    expect(token("--brand-aqua").toLowerCase()).toBe("#11aa9f");
    expect(token("--brand-grey").toLowerCase()).toBe("#cccccc");
    expect(token("--brand-white").toLowerCase()).toBe("#ffffff");
  });

  it("semantic tokens map to the brand", () => {
    expect(token("--foreground").toLowerCase()).toBe("#09426d");
    expect(token("--border").toLowerCase()).toBe("#cccccc");
  });

  it("primary button text meets WCAG AA (4.5:1)", () => {
    expect(contrastRatio(token("--primary-foreground"), token("--primary"))).toBeGreaterThanOrEqual(4.5);
  });

  it("Deep Blue on white meets WCAG AA (4.5:1)", () => {
    expect(contrastRatio(token("--brand-deep-blue"), token("--brand-white"))).toBeGreaterThanOrEqual(4.5);
  });

  it("contrast helper matches known values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#11AA9F")).toBeLessThan(4.5);
  });
});
