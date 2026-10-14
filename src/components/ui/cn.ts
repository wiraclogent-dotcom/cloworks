import { extendTailwindMerge } from "tailwind-merge";

// `text-compact` (13px, globals.css) is a font size, not a colour: without this tailwind-merge would let
// `text-compact` and `text-muted-foreground` knock each other out.
const twMerge = extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text: ["compact"] }] } } });

/**
 * Joins class names, skipping falsy values, and resolves Tailwind conflicts so the LAST class wins
 * (tailwind-merge 3, Tailwind v4 class names): `cn("h-9 px-4", "h-10")` → "px-4 h-10",
 * `cn("bg-card", "bg-sidebar-hover")` → "bg-sidebar-hover". Token colours (`text-foreground`) and font sizes
 * (`text-compact`) are different groups and are both kept; `text-sm` and `text-compact` conflict.
 */
export function cn(...parts: (string | false | null | undefined | 0)[]): string {
  return twMerge(parts.filter(Boolean).join(" "));
}

/** The one focus style: 2px ring in --ring with a 2px offset (globals.css also sets it as the base :focus-visible). */
export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
