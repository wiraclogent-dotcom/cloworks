import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { contrastRatio } from "@/lib/contrast";
import { TONES, AVATAR_PAIRS } from "@/lib/palette";

const css = fs.readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");

/** Custom properties declared directly inside the first rule whose selector is exactly `selector`. */
function vars(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Rule ${selector} not found`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const LIGHT = vars(":root");
const DARK = vars(':root[data-theme="dark"]');

type Theme = "light" | "dark";
/** Resolve a token for a theme. Dark overrides live on the same element as :root, so unset names fall back to light. */
function token(name: string, theme: Theme = "light"): string {
  const v = (theme === "dark" ? DARK[name] : undefined) ?? LIGHT[name];
  if (v === undefined) throw new Error(`Token ${name} not found`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? token(ref[1], theme) : v;
}

/** Flatten `rgba(r,g,b,a)` over an opaque hex background (what the eye sees), so contrast can be measured. */
function over(color: string, bgHex: string): string {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);
  if (!m) return color;
  const bg = parseInt(bgHex.slice(1), 16);
  const b = [(bg >> 16) & 255, (bg >> 8) & 255, bg & 255];
  const a = Number(m[4]);
  return "#" + [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * a + b[k] * (1 - a)).toString(16).padStart(2, "0")).join("");
}

const AA = 4.5;
const UI = 3;
const themes: Theme[] = ["light", "dark"];

describe("brand theme", () => {
  it("keeps the four brand colors unchanged", () => {
    expect(token("--brand-deep-blue").toLowerCase()).toBe("#09426d");
    expect(token("--brand-aqua").toLowerCase()).toBe("#11aa9f");
    expect(token("--brand-grey").toLowerCase()).toBe("#cccccc");
    expect(token("--brand-white").toLowerCase()).toBe("#ffffff");
    expect(token("--brand-aqua-strong").toLowerCase()).toBe("#0b756d");
  });

  it("light is the default with no OS dependence; dark only under data-theme", () => {
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(token("--background")).toBe("#f4f6fa");
    expect(token("--surface")).toBe("#ffffff");
    expect(token("--background", "dark")).toBe("#0e1b29");
    expect(token("--surface", "dark")).toBe("#14263a");
  });

  it("maps the shadcn semantic tokens onto the spec tokens", () => {
    expect(token("--foreground")).toBe("#1b2a3a");
    expect(token("--card")).toBe(token("--surface"));
    expect(token("--muted")).toBe(token("--surface-muted"));
    expect(token("--muted-foreground")).toBe(token("--foreground-secondary"));
    expect(token("--border")).toBe("#e4e8ef");
    expect(token("--border-strong")).toBe("#d0d7e2");
    expect(token("--primary").toLowerCase()).toBe("#09426d");
    expect(token("--primary-foreground")).toBe("#ffffff");
    expect(token("--sidebar").toLowerCase()).toBe("#09426d");
    expect(token("--primary", "dark")).toBe("#11aa9f");
    expect(token("--primary-foreground", "dark")).toBe("#062b47");
    expect(token("--sidebar", "dark")).toBe("#0a2f4e");
  });

  it("contrast helper matches known values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#11AA9F")).toBeLessThan(4.5);
  });
});

describe.each(themes)("contrast (%s)", (theme) => {
  const t = (n: string) => token(n, theme);
  const ratio = (fg: string, bg: string) => contrastRatio(fg, bg);

  it.each([
    ["--foreground", "--background"],
    ["--foreground", "--surface"],
    ["--foreground", "--surface-muted"],
    ["--foreground-secondary", "--surface"],
    ["--foreground-secondary", "--background"],
    ["--foreground-secondary", "--surface-muted"],
    ["--heading", "--surface"],
    ["--heading", "--background"],
    ["--link", "--surface"],
    ["--link", "--background"],
    // Phase B1: board column footer links sit on the muted column fill (and on the Aqua tint while a drop target).
    ["--link", "--surface-muted"],
    ["--link", "--accent"],
    ["--primary-foreground", "--primary"],
    ["--primary-foreground", "--primary-hover"],
    ["--destructive-foreground", "--destructive"],
    ["--destructive-foreground", "--destructive-hover"],
    ["--danger-text", "--surface"],
    ["--accent-foreground", "--accent"],
    ["--foreground", "--accent"],
    ["--foreground-secondary", "--accent"],
    ["--sidebar-foreground", "--sidebar"],
    ["--sidebar-foreground-secondary", "--sidebar"],
  ])("text %s on %s ≥ 4.5:1", (fg, bg) => {
    expect(ratio(t(fg), t(bg))).toBeGreaterThanOrEqual(AA);
  });

  it("sidebar text on the hover and active pills ≥ 4.5:1, Aqua icon on the active pill ≥ 3:1", () => {
    const hover = over(t("--sidebar-hover"), t("--sidebar"));
    const active = over(t("--sidebar-active"), t("--sidebar"));
    expect(ratio(t("--sidebar-foreground"), hover)).toBeGreaterThanOrEqual(AA);
    expect(ratio(t("--sidebar-foreground"), active)).toBeGreaterThanOrEqual(AA);
    expect(ratio(t("--sidebar-accent"), active)).toBeGreaterThanOrEqual(UI);
    expect(ratio(t("--sidebar-ring"), t("--sidebar"))).toBeGreaterThanOrEqual(UI);
  });

  it.each([
    ["--ring", "--surface"],
    ["--ring", "--background"],
    ["--ring", "--surface-muted"],
    ["--ring", "--accent"],
    ["--input", "--surface"],
    // Phase B1: Switch track (off = --input, on = --primary) against the card and its --surface knob.
    ["--primary", "--surface"],
    ["--foreground-muted", "--surface"],
    ["--chart-done", "--card"],
    ["--chart-target", "--card"],
  ])("UI/graphic %s against %s ≥ 3:1", (fg, bg) => {
    expect(ratio(t(fg), t(bg))).toBeGreaterThanOrEqual(UI);
  });

  it.each([...TONES])("chip text on tint ≥ 4.5:1: %s", (tone) => {
    expect(ratio(t(`--status-${tone}-text`), t(`--status-${tone}-tint`))).toBeGreaterThanOrEqual(AA);
  });

  it.each(AVATAR_PAIRS.map((_, i) => i + 1))("avatar %i initials on tint ≥ 4.5:1", (i) => {
    expect(ratio(t(`--avatar-${i}-text`), t(`--avatar-${i}-tint`))).toBeGreaterThanOrEqual(AA);
  });
});

describe("light-only pairs", () => {
  it("Aqua strong on white and Deep Blue on white meet AA", () => {
    expect(contrastRatio(token("--brand-aqua-strong"), "#ffffff")).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(token("--brand-deep-blue"), "#ffffff")).toBeGreaterThanOrEqual(AA);
  });
});

describe("theme boot script", () => {
  it("the root layout inlines the blocking theme script in <head>", () => {
    const layout = fs.readFileSync(path.resolve(__dirname, "../src/app/layout.tsx"), "utf8");
    expect(layout).toMatch(/<head>[\s\S]*THEME_INIT_SCRIPT[\s\S]*<\/head>/);
    expect(layout).toContain('data-theme="light"');
  });
});
