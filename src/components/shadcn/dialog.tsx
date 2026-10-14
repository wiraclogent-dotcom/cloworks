"use client"

import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { cn } from "@/components/ui/cn"
import { Button } from "@/components/shadcn/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/**
 * The backdrop. Not animated: the pop keyframes scale, which would flash the screen edges on a full-screen layer;
 * Radix unmounts it as soon as the dialog closes while the panel itself plays animate-pop-out.
 */
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-[var(--backdrop)]", className)}
      {...props}
    />
  )
}

/** The X in the top-right corner: our ghost icon Button (aria-label and title "Close"). */
function DialogCloseButton({ className }: { className?: string }) {
  return (
    <DialogPrimitive.Close asChild>
      <Button variant="ghost" size="icon" aria-label="Close" title="Close" className={className}>
        <XIcon />
      </Button>
    </DialogPrimitive.Close>
  )
}

/**
 * Radix returns focus to a `DialogTrigger` on close, and nowhere when there is none (dialogs opened from state, route
 * modals). `useReturnFocus` records what had focus when the dialog opened and, unless `onCloseAutoFocus` prevents it,
 * focuses that element again on close; when it is gone or was the body, Radix's own trigger focus applies.
 *
 * The record comes from `ReturnFocusProbe`, rendered inside the Radix Content: Content children render only while
 * open (once per opening) and before anything moves focus in. Content components themselves render while closed too,
 * and Radix skips `onOpenAutoFocus` when an `autoFocus` field already took focus, so neither can be the source.
 */
function useReturnFocus(onCloseAutoFocus?: (event: Event) => void) {
  const opener = React.useRef<HTMLElement | null>(null)
  return {
    record: (el: HTMLElement | null) => {
      opener.current = el
    },
    onCloseAutoFocus: (event: Event) => {
      const el = opener.current
      opener.current = null
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented || !el || el === document.body || !el.isConnected) return
      event.preventDefault()
      el.focus()
    },
  }
}

function ReturnFocusProbe({ record }: { record: (opener: HTMLElement | null) => void }) {
  const [active] = React.useState(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)
  )
  // Mount only: `record` is a new function each render of the content.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => record(active), [active])
  return null
}

/**
 * Centred dialog: portal + backdrop + panel (12px radius, raised shadow, pop-in/out), scrolls inside when tall.
 * `showClose` (default true) adds the X top-right; DialogHeader leaves room for it. Width: `max-w-lg` unless
 * `className` sets another `max-w-*`.
 */
function DialogContent({
  className,
  children,
  showClose = true,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showClose?: boolean
}) {
  const returnFocus = useReturnFocus(onCloseAutoFocus)
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-close={showClose ? "" : undefined}
        onCloseAutoFocus={returnFocus.onCloseAutoFocus}
        className={cn(
          "group/dialog fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-border bg-background p-4 text-foreground shadow-raised outline-hidden data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in sm:p-6",
          className
        )}
        {...props}
      >
        <ReturnFocusProbe record={returnFocus.record} />
        {children}
        {showClose && <DialogCloseButton className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4" />}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex min-w-0 flex-col gap-1 text-left group-data-[close]/dialog:pr-10", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  )
}

/** Dialog title: 16px semibold in the heading colour. */
function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-base font-semibold text-heading", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  ReturnFocusProbe,
  useReturnFocus,
}
