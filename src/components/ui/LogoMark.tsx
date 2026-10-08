import { cn } from "./cn";

/** Creative Tracker mark: Aqua tile with three Deep Blue board columns. Decorative (the product name is always next to it). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false" className={cn("shrink-0", className)}>
      <rect width="28" height="28" rx="7" className="fill-brand-aqua" />
      <rect x="7" y="7" width="3.5" height="14" rx="1.75" className="fill-brand-deep-blue" />
      <rect x="12.25" y="7" width="3.5" height="9.5" rx="1.75" className="fill-brand-deep-blue" />
      <rect x="17.5" y="7" width="3.5" height="11.75" rx="1.75" className="fill-brand-white" />
    </svg>
  );
}
