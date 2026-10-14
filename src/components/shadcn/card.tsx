import * as React from "react"
import { cn } from "@/components/ui/cn"

/**
 * White surface, 12px radius, hairline border, soft shadow, 16px padding.
 * Edge-to-edge tables pass `className="p-0"` (and `overflow-hidden` to clip the corners).
 */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-xl border border-border bg-card p-4 text-card-foreground shadow-card",
        className
      )}
      {...props}
    />
  )
}

/**
 * Title row of a card: everything except `CardAction` (title, description) stacks on the left; a `CardAction` sits
 * on the right. Unlike shadcn's two-column grid this is `flex-wrap`, so on a narrow screen the actions drop below the
 * title instead of squeezing it.
 */
function CardHeader({ className, children, ...props }: React.ComponentProps<"div">) {
  const parts = React.Children.toArray(children)
  const isAction = (part: React.ReactNode) => React.isValidElement(part) && part.type === CardAction
  return (
    <div
      data-slot="card-header"
      className={cn("mb-3 flex flex-wrap items-start justify-between gap-2", className)}
      {...props}
    >
      <div className="min-w-0">{parts.filter((part) => !isAction(part))}</div>
      {parts.filter(isAction)}
    </div>
  )
}

/** Section title inside a card: 16px/600. A real heading: h2 by default, `as="h3"` when nested deeper. */
function CardTitle({
  as: Tag = "h2",
  className,
  ...props
}: React.ComponentProps<"h2"> & { as?: "h2" | "h3" | "h4" }) {
  return (
    <Tag
      data-slot="card-title"
      className={cn("text-base font-semibold text-heading", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

/** The right-hand group of a `CardHeader` (buttons, a count). */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
}

/** The card already pads itself, so the body adds nothing; it is the slot to hang a ref or a `p-0` override on. */
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn(className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("mt-3 flex items-center gap-2", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
