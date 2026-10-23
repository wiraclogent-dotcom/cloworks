/**
 * Status, tag and avatar palette (V3 flat blue: stages in blue shades, warnings keep red/amber). Pure TS, no React.
 *
 * Single source of truth for the chip colours: `src/app/globals.css` writes the same values by hand as
 * `--status-<tone>-accent|tint|text` (light under `:root`, dark under `:root[data-theme="dark"]`), and
 * `tests/palette.test.ts` fails if the two ever drift apart. Components never use these hexes directly:
 * they set `data-tone="<tone>"` and use the `--tone-*` variables (see globals.css), or the CSS variables.
 *
 * Dark tints are the accent mixed into the dark surface `#121A2E`, flattened to an opaque hex so the contrast
 * tests can measure them; dark text uses a pale stop of the same hue.
 */
import type { ProjectStage, ProjectStatus, RequestStatus } from "@prisma/client";

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
    light: { accent: "#9AA3B5", tint: "#F1F3F7", text: "#3B4458" },
    dark: { accent: "#8A93A6", tint: "#222B3D", text: "#D3DAE6" },
  },
  "in-progress": {
    light: { accent: "#1F5EFF", tint: "#E8EEFF", text: "#0B3FD1" },
    dark: { accent: "#2F66FF", tint: "#172A5C", text: "#BFD0FF" },
  },
  "first-look": {
    light: { accent: "#38A3F5", tint: "#E6F4FF", text: "#0B5A99" },
    dark: { accent: "#38A3F5", tint: "#12324F", text: "#B8E0FF" },
  },
  done: {
    light: { accent: "#0B2A8F", tint: "#DDE3F5", text: "#0B2A8F" },
    dark: { accent: "#8FB0FF", tint: "#1E2A4F", text: "#DCE6FF" },
  },
  cancelled: {
    light: { accent: "#E24B4A", tint: "#FCEBEB", text: "#791F1F" },
    dark: { accent: "#E24B4A", tint: "#412E3E", text: "#F7C1C1" },
  },
  "needs-motion": {
    light: { accent: "#6D5BFF", tint: "#F0EEFF", text: "#4130B8" },
    dark: { accent: "#8B7BFF", tint: "#2A2559", text: "#D6D0FF" },
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
    light: { accent: "#1F5EFF", tint: "#EEF3FF", text: "#0B3FD1" },
    dark: { accent: "#2F66FF", tint: "#172A5C", text: "#BFD0FF" },
  },
  "tag-bubble-wash": {
    light: { accent: "#0E9BB8", tint: "#E3F6FA", text: "#075A6E" },
    dark: { accent: "#22B5D3", tint: "#10394A", text: "#A8E8F5" },
  },
  "tag-neutral": {
    light: { accent: "#8A93A6", tint: "#F1F3F7", text: "#3B4458" },
    dark: { accent: "#7D879E", tint: "#252E40", text: "#D3DAE6" },
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
  CANCELLED: "cancelled",
};

/** Tone of each stage in the progress bar and legend. Every stage gets its own palette entry; Final Artwork is the "done"
 *  tone and Canceled the "cancelled" one. Statuses (tracker projects) use PROJECT_STATUS_TONE; "none" is neutral. */
export const PROJECT_STAGE_TONE: Record<ProjectStage, Tone> = {
  NOT_STARTED: "requested",
  FIRST_PREVIEW: "first-look",
  MANUSCRIPT: "tag-clogent",
  TECHNICAL_ARTWORK: "needs-motion",
  APPROVAL: "due-soon",
  FINAL_ARTWORK: "done",
  CANCELLED: "cancelled",
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

export function normalizeName(name: string): string {
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

/**
 * Division lane colours on the Marketing Calendar (spec 2026-10-19). A division stores one key (`Division.color`);
 * globals.css writes the same values as `--division-<n>-accent|tint|text` and `[data-tone="div-<n>"]`.
 * Light tint = 12% accent on white, light text = accent darkened toward the foreground; dark tint = 28% accent on the
 * dark surface #121A2E, dark text = a pale stop. Text on tint is ≥ 4.5:1 in both themes (tests/palette.test.ts).
 */
export const DIVISION_TONES = ["div-1", "div-2", "div-3", "div-4", "div-5", "div-6", "div-7", "div-8"] as const;
export type DivisionTone = (typeof DIVISION_TONES)[number];

export const DIVISION_PALETTE: Record<DivisionTone, ThemedSwatch> = {
  "div-1": { // blue
    light: { accent: "#2A78D6", tint: "#E5EFFA", text: "#183E71" },
    dark: { accent: "#2A78D6", tint: "#19345D", text: "#B4D0F1" },
  },
  "div-2": { // coral
    light: { accent: "#EB6834", tint: "#FDEDE7", text: "#6F3728" },
    dark: { accent: "#EB6834", tint: "#4F3030", text: "#F8CAB8" },
  },
  "div-3": { // green
    light: { accent: "#1BAF7A", tint: "#E4F5EF", text: "#125748" },
    dark: { accent: "#1BAF7A", tint: "#154443", text: "#AFE3D0" },
  },
  "div-4": { // amber
    light: { accent: "#EDA100", tint: "#FDF4E0", text: "#705111" },
    dark: { accent: "#EDA100", tint: "#4F4021", text: "#F9DEA6" },
  },
  "div-5": { // pink
    light: { accent: "#E87BA4", tint: "#FCEFF4", text: "#6E405B" },
    dark: { accent: "#E87BA4", tint: "#4E354F", text: "#F7D1DF" },
  },
  "div-6": { // violet
    light: { accent: "#6D5BFF", tint: "#EDEBFF", text: "#373184" },
    dark: { accent: "#6D5BFF", tint: "#2B2C69", text: "#CCC6FF" },
  },
  "div-7": { // teal
    light: { accent: "#0E9BB8", tint: "#E2F3F6", text: "#0C4E64" },
    dark: { accent: "#0E9BB8", tint: "#113E55", text: "#ABDCE6" },
  },
  "div-8": { // slate
    light: { accent: "#8A93A6", tint: "#F1F2F4", text: "#444A5C" },
    dark: { accent: "#8A93A6", tint: "#343C50", text: "#D6D9E0" },
  },
};

/** Accessible names of the division colours (the swatch radios in Admin › Lists). */
export const DIVISION_TONE_LABEL: Record<DivisionTone, string> = {
  "div-1": "Blue", "div-2": "Coral", "div-3": "Green", "div-4": "Amber", "div-5": "Pink", "div-6": "Violet", "div-7": "Teal", "div-8": "Slate",
};

/**
 * Brand badge colours a brand can pick (`Brand.color`, spec 2026-10-23): today's two brand tags first, the eight
 * division tones, grey last. `brandTone(name)` stays the fallback where no brand directory is loaded.
 */
export const BRAND_TONES = ["tag-clogent", "tag-bubble-wash", ...DIVISION_TONES, "tag-neutral"] as const;
export type BrandTone = (typeof BRAND_TONES)[number];
export const BRAND_TONE_LABEL: Record<BrandTone, string> = {
  "tag-clogent": "Brand blue", "tag-bubble-wash": "Aqua", ...DIVISION_TONE_LABEL, "tag-neutral": "Grey",
};

/** The tone for a stored `Brand.color`; anything unknown is grey. */
export function brandColorTone(color: string): BrandTone {
  return (BRAND_TONES as readonly string[]).includes(color) ? (color as BrandTone) : "tag-neutral";
}

/** The tone for a stored `Division.color`; anything unknown is slate. */
export function divisionTone(color: string): DivisionTone {
  return (DIVISION_TONES as readonly string[]).includes(color) ? (color as DivisionTone) : "div-8";
}
