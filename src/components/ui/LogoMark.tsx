import { cn } from "./cn";

/** Cloworks mark: Aqua tile with a Deep Blue cloud over three board columns. Decorative (the product name is always next to it). */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false" className={cn("shrink-0", className)}>
      <rect width="28" height="28" rx="7" className="fill-brand-aqua" />
      <g className="fill-brand-deep-blue">
        <circle cx="10.5" cy="10.5" r="3.5" />
        <circle cx="14.5" cy="8.3" r="4.5" />
        <circle cx="18.5" cy="11" r="3.3" />
        <rect x="7" y="9.5" width="15" height="4.5" rx="2.25" />
      </g>
      <rect x="7" y="17" width="3.5" height="5.5" rx="1.75" className="fill-brand-deep-blue" />
      <rect x="12.25" y="17" width="3.5" height="5.5" rx="1.75" className="fill-brand-deep-blue" />
      <rect x="17.5" y="17" width="3.5" height="5.5" rx="1.75" className="fill-brand-white" />
    </svg>
  );
}
