"use client"

import * as React from "react"
import { cn } from "@/components/ui/cn"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"

/** The root's open state, for `CollapsibleContent keepMounted` (Radix does not export its own context). */
const OpenContext = React.createContext(false)

function Collapsible({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen)
  const open = openProp ?? uncontrolled
  return (
    <OpenContext.Provider value={open}>
      <CollapsiblePrimitive.Root
        data-slot="collapsible"
        open={open}
        onOpenChange={(next) => {
          if (openProp === undefined) setUncontrolled(next)
          onOpenChange?.(next)
        }}
        {...props}
      />
    </OpenContext.Provider>
  )
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

/**
 * The collapsible body. By default it is rendered only while open. `keepMounted` renders it once and only hides it
 * while closed (the `hidden` attribute), like `<details>`: typed input, form results and other state survive
 * collapsing, and closed content is in the server HTML. (Radix's `forceMount` alone keeps it mounted but visible.)
 */
function CollapsibleContent({
  keepMounted = false,
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent> & {
  keepMounted?: boolean
}) {
  const open = React.useContext(OpenContext)
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      className={cn(keepMounted && "data-[state=closed]:hidden", className)}
      {...(keepMounted ? { forceMount: true as const, hidden: !open } : {})}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
