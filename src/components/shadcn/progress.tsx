"use client"

import * as React from "react"
import { cn } from "@/components/ui/cn"
import { Progress as ProgressPrimitive } from "radix-ui"

/**
 * Track with a fill. `value` runs 0 to `max` (default 100). The fill is as wide as value/max; colour and
 * motion go on `indicatorClassName` (e.g. `bg-chart-done animate-bar`). Radix supplies the progressbar role and aria-value*.
 */
function Progress({
  className,
  indicatorClassName,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  const pct = typeof value === "number" && max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted outline outline-1 -outline-offset-1 outline-border", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("h-full rounded-full bg-primary transition-[width] duration-200 ease-out", indicatorClassName)}
        style={{ width: `${pct}%` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
