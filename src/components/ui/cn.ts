import { twMerge } from "tailwind-merge";

/**
 * Joins class names, skipping falsy values, and resolves Tailwind conflicts so the LAST class wins
 * (tailwind-merge 3, Tailwind v4 class names): `cn("h-9 px-4", "h-10")` → "px-4 h-10",
 * `cn("bg-surface", "bg-sidebar-hover")` → "bg-sidebar-hover". Token colours (`text-foreground`) and arbitrary sizes
 * (`text-[13px]`) are different groups and are both kept.
 */
export function cn(...parts: (string | false | null | undefined | 0)[]): string {
  return twMerge(parts.filter(Boolean).join(" "));
}

/** The one focus style: 2px ring in --ring with a 2px offset (globals.css also sets it as the base :focus-visible). */
export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
