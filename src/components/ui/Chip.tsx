import type { HTMLAttributes, ReactNode } from "react";
import { brandTone, type Tone } from "@/lib/palette";
import { cn } from "./cn";

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  /** Palette entry (src/lib/palette.ts). Default: neutral tag. */
  tone?: Tone;
  /** Decorative icon before the text (sized 14px). Meaning must also be in the text. */
  icon?: ReactNode;
};

/** 12px/500 label on a tinted background, 6px radius. Text + tint pairs are AA in both themes (tests/theme.test.ts). */
export function Chip({ tone = "tag-neutral", icon, className, children, ...rest }: ChipProps) {
  return (
    <span data-tone={tone} {...rest}
      className={cn("inline-flex max-w-full items-center gap-1 rounded-md bg-tone-tint px-2 py-0.5 text-xs leading-4 font-medium whitespace-nowrap text-tone-text [&_svg]:size-3.5 [&_svg]:shrink-0", className)}>
      {icon}
      {children}
    </span>
  );
}

/** Brand tag: Clogent and Bubble Wash have their own colours, every other brand is neutral. */
export function BrandTag({ name, className }: { name: string; className?: string }) {
  return <Chip tone={brandTone(name)} className={className}>{name}</Chip>;
}

/** Pill for counts (column totals, page counts): tabular numbers, full radius. */
export function CountPill({ value, className, "aria-label": label }: { value: number; className?: string; "aria-label"?: string }) {
  return (
    <span aria-label={label} className={cn("inline-flex min-w-6 items-center justify-center rounded-full bg-surface-muted px-2 py-0.5 text-xs leading-4 font-medium text-foreground-secondary tabular-nums", className)}>
      {value}
    </span>
  );
}
