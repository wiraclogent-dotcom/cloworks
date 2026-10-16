import * as React from "react"
import { cn } from "@/components/ui/cn"

/**
 * Monday-style table: hairlines, no zebra, row hover, sticky header, 13px text. Server-safe (no "use client").
 *
 * The container (`data-slot="table-container"`) is THE scroll box in both directions: the header sticks to its top,
 * so give it a max height for long tables (`containerClassName="max-h-[calc(100dvh-15rem)]"`) and never wrap the
 * table in a second `overflow-*` element (the inner one would become the sticky ancestor and the header would scroll
 * away). For the card look put it in `<Card className="overflow-hidden p-0">`. Width: `className="min-w-[64rem]"`.
 * Compact density: `className="py-1.5"` on the cells.
 */
function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-auto", containerClassName)}
    >
      <table
        data-slot="table"
        className={cn("w-full border-collapse text-left text-compact text-foreground", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={className} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-border bg-muted font-medium", className)}
      {...props}
    />
  )
}

/** Hairline between rows (none above the first), tint on hover. */
function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-t border-border transition-colors duration-150 ease-out first:border-t-0 hover:bg-muted/60 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

const PAD = "px-3 py-2.5"
/** Right-aligned tabular figures for count and score columns (our addition). */
const NUMERIC = "text-right tabular-nums"

/** Column header: sticks to the top of the table container, muted 12px semibold on the muted fill. Pass `scope="col"`. */
function TableHead({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "sticky top-0 z-10 border-b border-border bg-muted text-xs font-semibold whitespace-nowrap text-muted-foreground",
        PAD,
        numeric && NUMERIC,
        className
      )}
      {...props}
    />
  )
}

/** The row's title cell: a `<th scope="row">` in body text weight 500 (our addition; shadcn has none). */
function TableRowHeader({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-row-header"
      scope="row"
      className={cn("text-left align-middle font-medium", PAD, className)}
      {...props}
    />
  )
}

function TableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn("align-middle", PAD, numeric && NUMERIC, className)}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-compact text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRowHeader,
  TableRow,
  TableCell,
  TableCaption,
}
