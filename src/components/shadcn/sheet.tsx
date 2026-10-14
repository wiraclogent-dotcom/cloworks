"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { cn } from "@/components/ui/cn"
import { Button } from "@/components/shadcn/button"
import { useReturnFocus } from "@/components/shadcn/dialog"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

/** The backdrop; not animated, like DialogOverlay (a scaling full-screen layer would flash its edges). */
function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn("fixed inset-0 z-50 bg-[var(--backdrop)]", className)}
      {...props}
    />
  )
}

/** The X: our ghost icon Button (aria-label and title "Close"); place it yourself when `showClose={false}`. */
function SheetCloseButton({ className }: { className?: string }) {
  return (
    <SheetPrimitive.Close asChild>
      <Button variant="ghost" size="icon" aria-label="Close" title="Close" className={className}>
        <XIcon />
      </Button>
    </SheetPrimitive.Close>
  )
}

/**
 * Full-height panel from the right (or left): full width on phones, `sm:max-w-sm` by default (pass a width via
 * `className`, e.g. `sm:w-[min(64rem,92vw)] sm:max-w-none lg:w-[62vw]`). Scrolls inside; pop-in/out from its edge.
 */
function SheetContent({
  className,
  children,
  side = "right",
  showClose = true,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "right" | "left"
  showClose?: boolean
}) {
  const returnFocus = useReturnFocus(onCloseAutoFocus)
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        onCloseAutoFocus={returnFocus}
        className={cn(
          "fixed inset-y-0 z-50 flex h-dvh w-full flex-col overflow-y-auto border-border bg-background text-foreground shadow-raised outline-hidden data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in sm:w-3/4 sm:max-w-sm",
          side === "right" ? "right-0 origin-right border-l" : "left-0 origin-left border-r",
          className
        )}
        {...props}
      >
        {children}
        {showClose && <SheetCloseButton className="absolute top-2.5 right-2.5" />}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

/** Sheet title: 16px semibold in the heading colour, like DialogTitle. */
function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold text-heading", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetCloseButton,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
