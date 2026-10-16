import type { CSSProperties } from "react";
import { boardInk, presetOf, veilColor, type BoardPresetId } from "@/lib/boardBackground";

/**
 * The landing's frosted glass, three steps only, so every glass element on the page uses the same whites:
 * `surface` for large panels (the hero's app window), `card` for pills, step slices and icon tiles, `solid` for the one
 * card that has to stand out (the hero's travelling card). `frost` is the blur behind each of them.
 */
export const GLASS = {
  frost: "backdrop-blur-md backdrop-saturate-150",
  surface: "bg-white/30",
  card: "bg-white/50 ring-1 ring-white/80 ring-inset",
  solid: "bg-white/90 ring-1 ring-white ring-inset",
} as const;

/** Prism under a white wash: the bright fractal glass the hero and the closing call to action sit on, with dark ink. */
export const PRISM_VEIL = -40;

/**
 * A landing band on fractal glass: one of the board's preset pictures under a veil, with the board's ink for that
 * veil (`board-ink-dark` over a white wash, `board-ink-light` over a navy one), which re-points the text, card, muted
 * and border tokens. The same pairing the requests board uses; tests/landingGlass keeps the bands' text AA over the
 * whole picture. `position` picks which part of the picture shows. The landing is light only (<LightOnly>).
 */
export function glassBand(id: Exclude<BoardPresetId, "plain">, veil?: number, position = "center"): { className: string; style: CSSProperties } {
  const preset = presetOf(id);
  const v = veil ?? preset.defaultVeil;
  return {
    className: `board-picture ${boardInk(v) === "dark" ? "board-ink-dark" : "board-ink-light"}`,
    style: { "--board-image": `url(${JSON.stringify(preset.src)})`, "--board-veil": veilColor(v), backgroundPosition: position } as CSSProperties,
  };
}
