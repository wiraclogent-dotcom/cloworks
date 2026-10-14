import { cn } from "./cn";

/** Cloworks mark (V3 flat blue): a blue tile with a white four-point star. Decorative (the product name is always next to it). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false" className={cn("shrink-0", className)}>
      <rect width="28" height="28" rx="8" className="fill-brand-deep-blue" />
      <path d="M14 5.5l2 6.5 6.5 2-6.5 2-2 6.5-2-6.5L5.5 14l6.5-2z" className="fill-brand-white" />
    </svg>
  );
}
