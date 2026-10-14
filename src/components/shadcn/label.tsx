"use client"

import * as React from "react"
import { cn } from "@/components/ui/cn"
import { Label as LabelPrimitive } from "radix-ui"

/** Label look: 13px/500 with 6px below. Use on a `<legend>` or `<span>` that labels a group; `<Label>` for a real label. */
const labelClassName = "mb-1.5 block text-compact font-medium text-foreground"

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(labelClassName, "select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    />
  )
}

export { Label, labelClassName }
