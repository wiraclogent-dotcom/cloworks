"use client"

import * as React from "react"
import { cn } from "@/components/ui/cn"
import { Label as LabelPrimitive } from "radix-ui"
import { labelClassName } from "@/components/shadcn/label-class"

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

export { Label }
