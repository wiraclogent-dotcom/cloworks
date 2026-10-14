import * as React from "react"
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react"
import { cn } from "@/components/ui/cn"
import type { Tone } from "@/lib/palette"

type AlertVariant = "default" | "success" | "warning" | "destructive"

// Tinted by a palette entry (`data-tone`, globals.css), so one look covers light and dark.
const TONE: Record<AlertVariant, Tone> = {
  default: "in-progress",
  success: "done",
  warning: "due-soon",
  destructive: "cancelled",
}
const ICON = {
  default: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  destructive: CircleAlert,
} as const

/**
 * Inline message (replaces the kit's Alert): tinted box, icon on the left, content in the middle, an optional
 * `AlertAction` on the right. Put an `AlertTitle` and/or `AlertDescription` inside; everything except `AlertAction`
 * stacks in one column, like `CardHeader`. `variant` picks the palette tone and the default icon (`icon` swaps it,
 * `icon={false}` drops it). `role` defaults to "alert" for `destructive` and "status" otherwise; `role={null}` is
 * static text that is not announced. Server component.
 */
function Alert({
  variant = "default",
  icon,
  role,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "role"> & {
  variant?: AlertVariant
  icon?: React.ReactNode | false
  role?: "alert" | "status" | null
}) {
  const Icon = ICON[variant]
  const parts = React.Children.toArray(children)
  const isAction = (part: React.ReactNode) =>
    React.isValidElement(part) && part.type === AlertAction
  return (
    <div
      data-slot="alert"
      data-tone={TONE[variant]}
      role={role === null ? undefined : (role ?? (variant === "destructive" ? "alert" : "status"))}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-tone-accent/40 bg-tone-tint px-3 py-2.5 text-sm text-tone-text",
        className
      )}
      {...props}
    >
      {icon === false ? null : (
        <span
          data-slot="alert-icon"
          aria-hidden="true"
          className="mt-0.5 flex size-4 shrink-0 items-center justify-center [&_svg]:size-4"
        >
          {icon ?? <Icon aria-hidden="true" strokeWidth={1.75} />}
        </span>
      )}
      <div className="min-w-0 flex-1">{parts.filter((part) => !isAction(part))}</div>
      {parts.filter(isAction)}
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("font-semibold", className)}
      {...props}
    />
  )
}

/** A `div`, so a block child (`<p>`, `<ul>`) is valid inside it. */
function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="alert-description" className={cn(className)} {...props} />
  )
}

/** Right-hand slot (a dismiss or retry button); never shrinks. Our addition, shadcn's Alert has none. */
function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("shrink-0", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
