import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AVATAR_PAIRS, PALETTE, PROJECT_STATUS_TONE, REQUEST_STATUS_TONE, TONES, avatarColor, avatarIndex, brandTone, initials } from "@/lib/palette";

const css = fs.readFileSync(path.resolve(__dirname, "../src/app/globals.css"), "utf8");
function vars(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim().toLowerCase()]));
}
const CSS = { light: vars(":root"), dark: vars(':root[data-theme="dark"]') };

describe("palette ↔ globals.css (single source)", () => {
  it.each(["light", "dark"] as const)("every status/tag value in %s CSS equals src/lib/palette.ts", (theme) => {
    for (const tone of TONES) {
      for (const part of ["accent", "tint", "text"] as const) {
        expect(CSS[theme][`--status-${tone}-${part}`], `--status-${tone}-${part}`).toBe(PALETTE[tone][theme][part].toLowerCase());
      }
    }
  });
  it.each(["light", "dark"] as const)("every avatar pair in %s CSS equals the palette", (theme) => {
    AVATAR_PAIRS.forEach((p, i) => {
      expect(CSS[theme][`--avatar-${i + 1}-tint`]).toBe(p[theme].tint.toLowerCase());
      expect(CSS[theme][`--avatar-${i + 1}-text`]).toBe(p[theme].text.toLowerCase());
    });
  });
  it("every tone has a data-tone rule", () => {
    for (const tone of TONES) expect(css).toContain(`[data-tone="${tone}"] { --tone-accent: var(--status-${tone}-accent);`);
  });
  it("light values are the spec's", () => {
    expect(PALETTE.requested.light).toEqual({ accent: "#7A8CA5", tint: "#EAEFF5", text: "#2B3A4D" });
    expect(PALETTE.done.light).toEqual({ accent: "#11AA9F", tint: "#DDF4F1", text: "#085041" });
    expect(PALETTE["due-soon"].light).toEqual({ accent: "#BA7517", tint: "#FAEEDA", text: "#633806" });
  });
});

describe("status tones", () => {
  it("map every request and project status", () => {
    expect(REQUEST_STATUS_TONE).toEqual({ REQUESTED: "requested", ON_PROGRESS: "in-progress", FIRST_LOOK: "first-look", DONE: "done", CANCELLED: "cancelled" });
    expect(Object.keys(PROJECT_STATUS_TONE).sort()).toEqual(["DONE", "IN_PROGRESS", "IN_REVIEW", "NOT_STARTED", "ON_HOLD"]);
  });
  it("brand tags: Clogent and Bubble Wash get their colours, others neutral", () => {
    expect(brandTone("Clogent")).toBe("tag-clogent");
    expect(brandTone(" bubble wash ")).toBe("tag-bubble-wash");
    expect(brandTone("BubbleWash")).toBe("tag-bubble-wash");
    expect(brandTone("Other Co")).toBe("tag-neutral");
    expect(brandTone(null)).toBe("tag-neutral");
  });
});

describe("avatarColor", () => {
  it("is deterministic: same name, same colour", () => {
    expect(avatarColor("Dimas")).toEqual(avatarColor("Dimas"));
    expect(avatarIndex("Rina")).toBe(avatarIndex("Rina"));
  });
  it("ignores case, outer and repeated inner whitespace", () => {
    expect(avatarColor("  dimas ")).toEqual(avatarColor("Dimas"));
    expect(avatarColor("DIMAS  PANDU")).toEqual(avatarColor("Dimas Pandu"));
  });
  it("uses all 8 slots across a team and stays in range", () => {
    const names = ["Dimas", "Fafa", "Rina", "Cami", "Ibnu", "Wira", "Sari", "Tono", "Ayu", "Budi", "Citra", "Dewi", "Eko", "Gita", "Hadi", "Intan"];
    const slots = new Set(names.map(avatarIndex));
    for (const s of slots) expect(s >= 1 && s <= 8).toBe(true);
    expect(slots.size).toBeGreaterThanOrEqual(5);
  });
  it("handles an empty name", () => {
    expect(avatarIndex("")).toBe(8);
    expect(avatarColor("   ")).toEqual({ tint: "var(--avatar-8-tint)", text: "var(--avatar-8-text)" });
  });
  it("returns theme-aware CSS variables", () => {
    expect(avatarColor("Dimas").tint).toMatch(/^var\(--avatar-[1-8]-tint\)$/);
  });
});

describe("initials", () => {
  it.each([
    ["Dimas Pandu", "DP"],
    ["Fafa", "FA"],
    ["", "?"],
    ["   ", "?"],
    ["rina sari wulandari", "RS"],
    ["A", "A"],
    ["  ibnu   hajar ", "IH"],
  ])("%j → %s", (name, want) => {
    expect(initials(name)).toBe(want);
  });
});
