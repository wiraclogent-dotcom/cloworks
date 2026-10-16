import { describe, it, expect } from "vitest";
import path from "node:path";
import sharp from "sharp";
import {
  AA, BOARD_PRESETS, DEFAULT_BOARD_BACKGROUND, PLAIN_BOARD, autoVeil, boardInk, clampVeil, resolveBoardBackground, textContrast, veilColor,
} from "@/lib/boardBackground";

/** A preset picture scaled down the way the picker reads it. */
async function pixels(src: string) {
  const { data, info } = await sharp(path.resolve(__dirname, "../public", src.slice(1))).resize(320, 192, { fit: "fill" }).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

describe("board background", () => {
  it("every preset's default veil keeps the grey card text AA over the whole picture", async () => {
    for (const p of BOARD_PRESETS) {
      if (!p.src) continue;
      const { data, width, height } = await pixels(p.src);
      expect(textContrast(data, width, height, p.defaultVeil).muted, p.id).toBeGreaterThanOrEqual(AA);
    }
  });

  it("the auto veil is the gentlest AA veil on the asked side", async () => {
    const { data, width, height } = await pixels("/board/gradient.jpg");
    const dark = autoVeil(data, width, height, "dark")!;
    expect(dark).toBeGreaterThan(0);
    expect(textContrast(data, width, height, dark).muted).toBeGreaterThanOrEqual(AA);
    expect(textContrast(data, width, height, dark - 2).muted).toBeLessThan(AA);
    const light = autoVeil(data, width, height, "light")!;
    expect(light).toBeLessThan(0);
    expect(boardInk(light)).toBe("dark");
  });

  it("a white picture with no veil fails, and says so", () => {
    const white = new Uint8ClampedArray(20 * 20 * 4).fill(255);
    expect(textContrast(white, 20, 20, 0).text).toBeLessThan(1.5);
    expect(textContrast(white, 20, 20, -40).muted).toBeGreaterThanOrEqual(AA);
  });

  it("resolves the stored choice", () => {
    expect(resolveBoardBackground({ id: null, veil: null, customSrc: null }).id).toBe(DEFAULT_BOARD_BACKGROUND);
    expect(resolveBoardBackground({ id: "plain", veil: 40, customSrc: null })).toEqual(PLAIN_BOARD);
    expect(resolveBoardBackground({ id: "ocean", veil: null, customSrc: null }).veil).toBe(BOARD_PRESETS.find((p) => p.id === "ocean")!.defaultVeil);
    expect(resolveBoardBackground({ id: "ocean", veil: 300, customSrc: null }).veil).toBe(100);
    expect(resolveBoardBackground({ id: "custom", veil: -20, customSrc: "https://x/y.jpg" })).toEqual({ id: "custom", veil: -20, src: "https://x/y.jpg" });
    // The uploaded picture is gone: back to the default preset.
    expect(resolveBoardBackground({ id: "custom", veil: 10, customSrc: null }).id).toBe(DEFAULT_BOARD_BACKGROUND);
    expect(resolveBoardBackground({ id: "nope", veil: 0, customSrc: null }).id).toBe(DEFAULT_BOARD_BACKGROUND);
  });

  it("veil colour and ink follow the slider's side", () => {
    expect(veilColor(100)).toBe("rgb(6 16 52 / 0.85)");
    expect(veilColor(-50)).toBe("rgb(255 255 255 / 0.425)");
    expect(veilColor(0)).toBe("rgb(6 16 52 / 0)");
    expect(boardInk(0)).toBe("light");
    expect(boardInk(-1)).toBe("dark");
    expect(clampVeil("12.6")).toBe(13);
    expect(clampVeil("x")).toBe(0);
  });
});
