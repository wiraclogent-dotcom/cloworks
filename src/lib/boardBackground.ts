/**
 * Board background: what the requests board sits on, chosen per person (User.boardBackground / boardVeil /
 * boardBackgroundMedia). "plain" is the classic board (solid cards, muted columns); every other choice is a picture
 * with glass cards over it, and a veil between the two that the person slides from light to dark.
 *
 * The veil is one number, -100..100. Above 0 it is a deep-navy wash and the cards' text is white; below 0 it is a
 * white wash and the text turns dark; 0 shows the picture as it is (white text). `textContrast` measures the result
 * from the picture's pixels, the same way for presets (tests) and uploads (the picker, live).
 */

/** Each preset's `defaultVeil` is the gentlest that keeps the grey card text AA over the whole picture (tests/boardBackground). */
export const BOARD_PRESETS = [
  { id: "plain", label: "Plain", src: null, defaultVeil: 0 },
  { id: "gradient", label: "Prism", src: "/board/gradient.jpg", defaultVeil: 78 },
  { id: "ocean", label: "Ocean", src: "/board/ocean.jpg", defaultVeil: 40 },
  { id: "sunset", label: "Sunset", src: "/board/sunset.jpg", defaultVeil: 60 },
  { id: "aurora", label: "Aurora", src: "/board/aurora.jpg", defaultVeil: 46 },
  { id: "mist", label: "Mist", src: "/board/mist.jpg", defaultVeil: -10 },
] as const;

export type BoardPresetId = (typeof BOARD_PRESETS)[number]["id"];
export type BoardBackgroundId = BoardPresetId | "custom";

/** What the board renders: the choice, its veil, and the picture's URL (null only for "plain"). */
export type BoardBackground = { id: BoardBackgroundId; veil: number; src: string | null };

export const DEFAULT_BOARD_BACKGROUND: BoardPresetId = "gradient";
export const PLAIN_BOARD: BoardBackground = { id: "plain", veil: 0, src: null };

/** Strongest wash at either end of the slider: the picture always shows through a little. */
export const VEIL_MAX_ALPHA = 0.85;
const NAVY: Rgb = [6, 16, 52];
const WHITE: Rgb = [255, 255, 255];

/** A small copy of a preset picture for the picker (public/board/thumbs). */
export const thumbOf = (src: string) => src.replace("/board/", "/board/thumbs/");

export const isPresetId =(v: unknown): v is BoardPresetId => BOARD_PRESETS.some((p) => p.id === v);
export const presetOf = (id: BoardPresetId) => BOARD_PRESETS.find((p) => p.id === id)!;

/** Whole number in -100..100; anything else (NaN, strings) becomes 0. */
export function clampVeil(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(-100, Math.min(100, Math.round(n))) : 0;
}

/**
 * The stored choice as the board renders it. An unknown id falls back to the default preset; "custom" without a
 * picture (it was removed) does too; a missing veil takes the preset's tested default.
 */
export function resolveBoardBackground(stored: { id: string | null; veil: number | null; customSrc: string | null }): BoardBackground {
  if (stored.id === "custom" && stored.customSrc) return { id: "custom", veil: stored.veil == null ? 0 : clampVeil(stored.veil), src: stored.customSrc };
  const preset = presetOf(isPresetId(stored.id) ? stored.id : DEFAULT_BOARD_BACKGROUND);
  if (preset.id === "plain") return PLAIN_BOARD;
  return { id: preset.id, veil: stored.veil == null ? preset.defaultVeil : clampVeil(stored.veil), src: preset.src };
}

/** Which ink the cards use over this veil: white over a dark wash (or none), dark over a light one. */
export const boardInk = (veil: number): "light" | "dark" => (veil < 0 ? "dark" : "light");

/** The wash as a CSS colour, painted over the picture. */
export function veilColor(veil: number): string {
  const a = +((Math.abs(clampVeil(veil)) / 100) * VEIL_MAX_ALPHA).toFixed(3);
  const [r, g, b] = veil < 0 ? WHITE : NAVY;
  return `rgb(${r} ${g} ${b} / ${a})`;
}

type Rgb = [number, number, number];

const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const over = (c: Rgb, top: Rgb, a: number): Rgb => [c[0] * (1 - a) + top[0] * a, c[1] * (1 - a) + top[1] * a, c[2] * (1 - a) + top[2] * a];
const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Card ink per side, as the board's tokens set them (globals.css `board-ink-light` / `board-ink-dark`). */
const INK = {
  light: { text: WHITE, muted: { color: WHITE, alpha: 0.94 } },
  dark: { text: [10, 15, 31] as Rgb, muted: { color: [40, 48, 72] as Rgb, alpha: 1 } },
};
/** The glass between picture and text: the column's 7% white wash, then the card's 8% white tint. */
const COLUMN_WASH = 0.07;
const CARD_TINT = 0.08;

/**
 * Worst-case contrast of the cards' text over this picture and veil. `pixels` is RGBA, `width`×`height`, the picture
 * scaled down; each `patch`×`patch` square is averaged (the cards blur what is behind them) and the hardest square
 * decides. `muted` is the grey secondary text, the one that fails first; aim for 4.5 (WCAG AA).
 */
export function textContrast(pixels: ArrayLike<number>, width: number, height: number, veil: number, patch = 6): { text: number; muted: number } {
  const side = boardInk(veil);
  const ink = INK[side];
  const wash = veil === 0 ? null : { color: veil < 0 ? WHITE : NAVY, alpha: (Math.abs(clampVeil(veil)) / 100) * VEIL_MAX_ALPHA };
  let text = Infinity, muted = Infinity;
  const step = Math.max(1, Math.floor(patch / 2));
  for (let y = 0; y + patch <= height; y += step) {
    for (let x = 0; x + patch <= width; x += step) {
      let r = 0, g = 0, b = 0;
      for (let py = y; py < y + patch; py++) for (let px = x; px < x + patch; px++) {
        const i = (py * width + px) * 4;
        r += pixels[i]; g += pixels[i + 1]; b += pixels[i + 2];
      }
      const n = patch * patch;
      let bg: Rgb = [r / n, g / n, b / n];
      if (wash) bg = over(bg, wash.color as Rgb, wash.alpha);
      bg = over(over(bg, WHITE, COLUMN_WASH), WHITE, CARD_TINT);
      const lb = luminance(bg);
      text = Math.min(text, ratio(luminance(ink.text), lb));
      muted = Math.min(muted, ratio(luminance(over(bg, ink.muted.color, ink.muted.alpha)), lb));
    }
  }
  return { text: +text.toFixed(2), muted: +muted.toFixed(2) };
}

/** AA for the cards' small text. */
export const AA = 4.5;

/**
 * The gentlest veil, on the side `toward` (dark: white text, light: dark text), that keeps the grey text AA; null
 * when even the strongest wash on that side cannot.
 */
export function autoVeil(pixels: ArrayLike<number>, width: number, height: number, toward: "dark" | "light", patch = 6): number | null {
  const sign = toward === "dark" ? 1 : -1;
  for (let v = 0; v <= 100; v += 2) {
    const veil = v === 0 && toward === "light" ? -1 : sign * v;
    if (textContrast(pixels, width, height, veil, patch).muted >= AA) return veil;
  }
  return null;
}
