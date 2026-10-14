"use client"

import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"
import { cn } from "@/components/ui/cn"
import { toggleVariants } from "@/components/shadcn/toggle"

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({
  size: "default",
  variant: "default",
})

/**
 * A set of toggles. `type="single"` (one choice: view switch, category filter) is what Radix exposes as a
 * `radiogroup` of `radio`s with `aria-checked`, with arrow-key roving focus; give it an `aria-label`. Our change: a
 * single group never clears its choice (clicking the chosen item does nothing), so use it controlled (`value` +
 * `onValueChange`). `type="multiple"` is a toolbar of `aria-pressed` toggles. Spacing via `className` (`gap-1`); the
 * `variant`/`size` set here apply to every item.
 */
function ToggleGroup({
  className,
  variant,
  size,
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  const rootProps =
    props.type === "single"
      ? {
          ...props,
          onValueChange: (value: string) => {
            if (value) props.onValueChange?.(value)
          },
        }
      : props
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      className={cn("flex w-fit items-center", className)}
      {...rootProps}
    >
      <ToggleGroupContext.Provider value={{ variant, size }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item> &
  VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        "shrink-0 focus-visible:z-10",
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
}

export { ToggleGroup, ToggleGroupItem }
