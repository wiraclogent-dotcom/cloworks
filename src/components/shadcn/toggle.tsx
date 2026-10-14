"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Toggle as TogglePrimitive } from "radix-ui"
import { cn, focusRing } from "@/components/ui/cn"

/**
 * Pressed/unpressed button (Radix: `aria-pressed`, `data-state="on|off"`). Variants:
 * - `default`: quiet text, Aqua tint when on.
 * - `outline`: bordered pill-ready chip (pass `rounded-full`), Aqua tint when on (Library category pills).
 * - `segment`: one segment in a muted tray (`SEGMENT_TRAY`), raised card when on (SegmentedControl).
 * `size="sm"` is 32px high with a 36px hit area.
 */
const toggleVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-1.5 rounded-lg text-compact font-medium whitespace-nowrap transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    focusRing
  ),
  {
    variants: {
      variant: {
        default:
          "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
        outline:
          "border border-border-strong bg-card text-foreground hover:bg-muted data-[state=on]:border-transparent data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
        segment:
          "text-muted-foreground hover:bg-card/60 hover:text-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-card",
      },
      size: {
        default: "h-9 min-w-9 px-3",
        sm: "relative h-8 min-w-8 px-3 after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-['']",
        lg: "h-10 min-w-10 px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
