import * as React from "react"
import { cva } from "class-variance-authority"
import { Slot } from "radix-ui"
import { cn } from "@/components/ui/cn"
import type { DivisionTone, Tone } from "@/lib/palette"

const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1 px-2 py-0.5 text-xs leading-4 font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Tinted by a palette entry (`data-tone`, globals.css). Text + tint pairs are AA in both themes (tests/theme.test.ts).
        default: "rounded-md bg-tone-tint text-tone-text",
        // Counts (column totals, page counts): full radius, muted, tabular numbers.
        count: "min-w-6 justify-center rounded-full bg-muted text-muted-foreground tabular-nums",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * 12px/500 label on a tinted background, 6px radius (replaces the kit's Chip). `tone` is a palette entry
 * (src/lib/palette.ts), default neutral tag; put a decorative icon before the text as a child (sized 14px; the
 * meaning must also be in the text). `variant="count"` is the pill for numbers and takes no tone. `asChild` puts the
 * badge on the child element (our addition; shadcn's has it too). Server component.
 */
function Badge({
  className,
  variant = "default",
  tone,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & {
  tone?: Tone | DivisionTone
  variant?: "default" | "count"
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-tone={variant === "default" ? (tone ?? "tag-neutral") : undefined}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
