import { describe, it, expect } from "vitest";
import path from "node:path";
import sharp from "sharp";
import { AA, VEIL_MAX_ALPHA, presetOf, veilColor } from "@/lib/boardBackground";
import { PRISM_VEIL, glassBand } from "@/components/landing/glassBand";

type Rgb = [number, number, number];
const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const over = (c: Rgb, top: Rgb, a: number): Rgb => [c[0] * (1 - a) + top[0] * a, c[1] * (1 - a) + top[1] * a, c[2] * (1 - a) + top[2] * a];
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The dark ink's text colour (`board-ink-dark` --foreground / --heading): the bands' text sits straight on the picture. */
const INK: Rgb = [10, 15, 31];

/** Lowest contrast of the dark ink straight on the picture under a white veil, over every 6px patch. */
async function inkOnPicture(src: string, veil: number) {
  const { data, info } = await sharp(path.resolve(__dirname, "../public", src.slice(1))).resize(320, 192, { fit: "fill" }).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const wash = (Math.abs(veil) / 100) * VEIL_MAX_ALPHA;
  let min = Infinity;
  for (let y = 0; y + 6 <= info.height; y += 3) {
    for (let x = 0; x + 6 <= info.width; x += 3) {
      let r = 0, g = 0, b = 0;
      for (let py = y; py < y + 6; py++) for (let px = x; px < x + 6; px++) {
        const i = (py * info.width + px) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2];
      }
      min = Math.min(min, ratio(luminance(INK), luminance(over([r / 36, g / 36, b / 36], [255, 255, 255], wash))));
    }
  }
  return min;
}

describe("landing glass bands", () => {
  it("Prism's white wash keeps the hero and closing text AA over the whole picture", async () => {
    expect(PRISM_VEIL).toBeLessThan(0);
    expect(await inkOnPicture(presetOf("gradient").src!, PRISM_VEIL)).toBeGreaterThanOrEqual(AA);
  });

  it("Mist at its default veil keeps the How it works text AA", async () => {
    const mist = presetOf("mist");
    expect(await inkOnPicture(mist.src!, mist.defaultVeil)).toBeGreaterThanOrEqual(AA);
  });

  it("a band paints its picture under the veil with the matching ink", () => {
    const light = glassBand("gradient", PRISM_VEIL, "center top");
    expect(light.className).toBe("board-picture board-ink-dark");
    expect(light.style).toMatchObject({ "--board-image": 'url("/board/gradient.jpg")', "--board-veil": veilColor(PRISM_VEIL), backgroundPosition: "center top" });
    expect(glassBand("ocean").className).toBe("board-picture board-ink-light");
    expect(glassBand("ocean").style).toMatchObject({ "--board-veil": veilColor(presetOf("ocean").defaultVeil), backgroundPosition: "center" });
  });
});
