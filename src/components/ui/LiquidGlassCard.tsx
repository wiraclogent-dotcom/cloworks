import type { ComponentPropsWithRef, ElementType } from "react";
import { cn } from "./cn";

/*
 * Liquid glass card, from 21st.dev's liquid-weather-glass. Four stacked layers, as in the original:
 * bend (the backdrop blurred, then bent by the SVG filter #glass-blur), face (outer glow), edge (inner highlights),
 * then the content. The tint is the card's own background (`className`, e.g. `bg-white/8`), painted under the layers.
 * Changes from the original: the filter lives once in <LiquidGlassFilter> (root layout) instead of one <svg> per card;
 * no motion drag/expand (board cards are dragged by dnd-kit); `as` renders it as the element the caller needs (`li`).
 */

type Intensity = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const BLUR = { sm: "backdrop-blur-sm", md: "backdrop-blur-md", lg: "backdrop-blur-lg", xl: "backdrop-blur-xl" } as const;

const SHADOW: Record<Intensity, string> = {
  none: "inset 0 0 0 0 rgba(255, 255, 255, 0)",
  xs: "inset 1px 1px 1px 0 rgba(255, 255, 255, 0.3), inset -1px -1px 1px 0 rgba(255, 255, 255, 0.3)",
  sm: "inset 2px 2px 2px 0 rgba(255, 255, 255, 0.35), inset -2px -2px 2px 0 rgba(255, 255, 255, 0.35)",
  md: "inset 3px 3px 3px 0 rgba(255, 255, 255, 0.45), inset -3px -3px 3px 0 rgba(255, 255, 255, 0.45)",
  lg: "inset 4px 4px 4px 0 rgba(255, 255, 255, 0.5), inset -4px -4px 4px 0 rgba(255, 255, 255, 0.5)",
  xl: "inset 6px 6px 6px 0 rgba(255, 255, 255, 0.55), inset -6px -6px 6px 0 rgba(255, 255, 255, 0.55)",
  "2xl": "inset 8px 8px 8px 0 rgba(255, 255, 255, 0.6), inset -8px -8px 8px 0 rgba(255, 255, 255, 0.6)",
};

const GLOW: Record<Intensity, string> = {
  none: "0 4px 4px rgba(0, 0, 0, 0.05), 0 0 12px rgba(0, 0, 0, 0.05)",
  xs: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 16px rgba(255, 255, 255, 0.05)",
  sm: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 24px rgba(255, 255, 255, 0.1)",
  md: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 32px rgba(255, 255, 255, 0.15)",
  lg: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 40px rgba(255, 255, 255, 0.2)",
  xl: "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 48px rgba(255, 255, 255, 0.25)",
  "2xl": "0 4px 4px rgba(0, 0, 0, 0.15), 0 0 12px rgba(0, 0, 0, 0.08), 0 0 60px rgba(255, 255, 255, 0.3)",
};

type LiquidGlassCardProps<T extends ElementType> = {
  as?: T;
  blurIntensity?: keyof typeof BLUR;
  shadowIntensity?: Intensity;
  glowIntensity?: Intensity;
  borderRadius?: string;
} & Omit<ComponentPropsWithRef<T>, "as">;

export function LiquidGlassCard<T extends ElementType = "div">({
  as, children, className, style, blurIntensity = "xl", shadowIntensity = "md", glowIntensity = "sm", borderRadius = "32px", ...rest
}: LiquidGlassCardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return (
    <Tag className={cn("relative", className)} style={{ borderRadius, ...style }} {...rest}>
      {/* Bend layer: backdrop blur, bent by #glass-blur */}
      <div aria-hidden="true" data-glass-layer="bend" className={cn("pointer-events-none absolute inset-0 z-0", BLUR[blurIntensity])}
        style={{ borderRadius, filter: "url(#glass-blur)" }} />
      {/* Face layer: outer shadow and glow */}
      <div aria-hidden="true" data-glass-layer="face" className="pointer-events-none absolute inset-0 z-10" style={{ borderRadius, boxShadow: GLOW[glowIntensity] }} />
      {/* Edge layer: inner highlights */}
      <div aria-hidden="true" data-glass-layer="edge" className="pointer-events-none absolute inset-0 z-20" style={{ borderRadius, boxShadow: SHADOW[shadowIntensity] }} />
      <div className="relative z-30">{children}</div>
    </Tag>
  );
}
