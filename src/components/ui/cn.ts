/** Joins class names, skipping falsy values. `cn("a", cond && "b", undefined)` → "a b". */
export function cn(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** The one focus style: 2px ring in --ring with a 2px offset (globals.css also sets it as the base :focus-visible). */
export const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
