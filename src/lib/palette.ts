/**
 * Status, tag and avatar palette (UI redesign spec 2026-10-08). Pure TS, no React.
 *
 * Single source of truth for the chip colours: `src/app/globals.css` writes the same values by hand as
 * `--status-<tone>-accent|tint|text` (light under `:root`, dark under `:root[data-theme="dark"]`), and
 * `tests/palette.test.ts` fails if the two ever drift apart. Components never use these hexes directly:
 * they set `data-tone="<tone>"` and use the `--tone-*` variables (see globals.css), or the CSS variables.
 *
 * Dark tints are the accent at 22% over the dark surface `#14263A`, flattened to an opaque hex so the
 * contrast tests can measure them; dark text uses the 100/200 stop of the same hue.
 */
import type { ProjectStatus, RequestStatus } from "@prisma/client";

export type Swatch = { accent: string; tint: string; text: string };
export type ThemedSwatch = { light: Swatch; dark: Swatch };

export const TONES = [
  "requested",
  "in-progress",
  "first-look",
  "done",
  "cancelled",
  "needs-motion",
  "due-soon",
  "overdue",
  "tag-clogent",
  "tag-bubble-wash",
  "tag-neutral",
] as const;
export type Tone = (typeof TONES)[number];

export const PALETTE: Record<Tone, ThemedSwatch> = {
  requested: {
    light: { accent: "#7A8CA5", tint: "#EAEFF5", text: "#2B3A4D" },
    dark: { accent: "#7A8CA5", tint: "#2A3C52", text: "#D3DCE8" },
  },
  "in-progress": {
    light: { accent: "#2F7FC1", tint: "#E3EEF9", text: "#0C447C" },
    dark: { accent: "#2F7FC1", tint: "#1A3A58", text: "#B5D4F4" },
  },
  "first-look": {
    light: { accent: "#7F77DD", tint: "#EEEDFE", text: "#3C3489" },
    dark: { accent: "#7F77DD", tint: "#2C385E", text: "#CECBF6" },
  },
  done: {
    light: { accent: "#11AA9F", tint: "#DDF4F1", text: "#085041" },
    dark: { accent: "#11AA9F", tint: "#134350", text: "#9FE1CB" },
  },
  cancelled: {
    light: { accent: "#E24B4A", tint: "#FCEBEB", text: "#791F1F" },
    dark: { accent: "#E24B4A", tint: "#412E3E", text: "#F7C1C1" },
  },
  "needs-motion": {
    light: { accent: "#D85A30", tint: "#FAECE7", text: "#712B13" },
    dark: { accent: "#D85A30", tint: "#3F3138", text: "#F5C4B3" },
  },
  "due-soon": {
    light: { accent: "#BA7517", tint: "#FAEEDA", text: "#633806" },
    dark: { accent: "#BA7517", tint: "#393732", text: "#FAC775" },
  },
  overdue: {
    light: { accent: "#E24B4A", tint: "#FCEBEB", text: "#791F1F" },
    dark: { accent: "#E24B4A", tint: "#412E3E", text: "#F7C1C1" },
  },
  "tag-clogent": {
    light: { accent: "#378ADD", tint: "#E6F1FB", text: "#0C447C" },
    dark: { accent: "#378ADD", tint: "#1C3C5E", text: "#B5D4F4" },
  },
  "tag-bubble-wash": {
    light: { accent: "#1D9E75", tint: "#E1F5EE", text: "#085041" },
    dark: { accent: "#1D9E75", tint: "#164047", text: "#9FE1CB" },
  },
  "tag-neutral": {
    light: { accent: "#8190A3", tint: "#F1F4F8", text: "#3A4A5E" },
    dark: { accent: "#7D93A9", tint: "#2C3D51", text: "#D3DCE8" },
  },
};

/** Request and project statuses share one chip palette. */
export const REQUEST_STATUS_TONE: Record<RequestStatus, Tone> = {
  REQUESTED: "requested",
  ON_PROGRESS: "in-progress",
  FIRST_LOOK: "first-look",
  DONE: "done",
  CANCELLED: "cancelled",
};
export const PROJECT_STATUS_TONE: Record<ProjectStatus, Tone> = {
  NOT_STARTED: "requested",
  IN_PROGRESS: "in-progress",
  IN_REVIEW: "first-look",
  DONE: "done",
  ON_HOLD: "due-soon",
};

/** Brand name to tag tone; unknown brands get the neutral tag. Case/whitespace-insensitive. */
export function brandTone(brandName: string | null | undefined): Tone {
  const key = normalizeName(brandName ?? "").replace(/\s+/g, "");
  if (key === "clogent") return "tag-clogent";
  if (key === "bubblewash") return "tag-bubble-wash";
  return "tag-neutral";
}

/** 8 avatar tint/text pairs (light, dark). CSS: `--avatar-<1..8>-tint|text`. */
export const AVATAR_PAIRS: { light: { tint: string; text: string }; dark: { tint: string; text: string } }[] = [
  { light: { tint: "#E6F1FB", text: "#0C447C" }, dark: { tint: "#1E4268", text: "#B5D4F4" } },
  { light: { tint: "#DDF4F1", text: "#085041" }, dark: { tint: "#134B56", text: "#9FE1CB" } },
  { light: { tint: "#EEEDFE", text: "#3C3489" }, dark: { tint: "#323D68", text: "#CECBF6" } },
  { light: { tint: "#FAECE7", text: "#712B13" }, dark: { tint: "#4B3537", text: "#F5C4B3" } },
  { light: { tint: "#FAEEDA", text: "#633806" }, dark: { tint: "#423C30", text: "#FAC775" } },
  { light: { tint: "#FBEAF0", text: "#72243E" }, dark: { tint: "#4A334D", text: "#F4C0D1" } },
  { light: { tint: "#EAF3DE", text: "#27500A" }, dark: { tint: "#2A4633", text: "#C0DD97" } },
  { light: { tint: "#EAEFF5", text: "#2B3A4D" }, dark: { tint: "#314358", text: "#D3DCE8" } },
];

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Deterministic 1..8 slot for a person (trimmed, case- and inner-whitespace-insensitive). Empty name → slot 8 (slate). */
export function avatarIndex(name: string | null | undefined): number {
  const key = normalizeName(name ?? "");
  if (!key) return AVATAR_PAIRS.length;
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
  return (h % AVATAR_PAIRS.length) + 1;
}

/**
 * Avatar colours for a person as CSS variable references, so they follow the active theme
 * (the raw hexes are `AVATAR_PAIRS[avatarIndex(name) - 1]`).
 */
export function avatarColor(name: string | null | undefined): { tint: string; text: string } {
  const i = avatarIndex(name);
  return { tint: `var(--avatar-${i}-tint)`, text: `var(--avatar-${i}-text)` };
}

/** "Dimas Pandu" → "DP", "Fafa" → "FA", "" → "?". First letters of the first two words, uppercase. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) {
    const chars = Array.from(words[0]);
    return chars.slice(0, 2).join("").toUpperCase();
  }
  return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
}
