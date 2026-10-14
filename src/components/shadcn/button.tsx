import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { LoaderCircle } from "lucide-react"
import { Slot } from "radix-ui"
import { cn, focusRing } from "@/components/ui/cn"

const buttonStyles = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 " +
    focusRing,
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-card hover:bg-primary-hover",
        destructive: "bg-destructive text-destructive-foreground shadow-card hover:bg-destructive-hover",
        outline: "border border-border-strong bg-card text-foreground shadow-card hover:bg-muted",
        secondary: "bg-muted text-foreground hover:bg-muted/80",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 text-sm",
        // 32px visual, 36px hit area (a transparent ::after extends it 2px up and down).
        sm: "relative h-8 px-3 text-compact after:absolute after:inset-x-0 after:-inset-y-0.5 after:content-['']",
        icon: "size-9 [&_svg]:size-[18px]",
        "icon-sm": "relative size-8 after:absolute after:-inset-0.5 after:content-[''] [&_svg]:size-[18px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/** Button classes for anything that should look like a button (`summary`, `label`); `className` wins on conflicts. */
function buttonVariants(options?: Parameters<typeof buttonStyles>[0]): string {
  return cn(buttonStyles(options))
}

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonStyles> & {
    asChild?: boolean
    /** Shows a spinner, sets aria-busy and disables the button. Keep the label (e.g. "Saving…"). */
    loading?: boolean
    /** Icon before the label (lucide icon element; sized automatically). */
    icon?: React.ReactNode
    /** Icon after the label. */
    iconRight?: React.ReactNode
  }

/**
 * `type` defaults to "button" (pass type="submit" inside forms). Always pass an explicit `variant`: tests/buttonUsage
 * enforces it, because the default is the primary look. With `asChild` the child (e.g. a `<Link>`) is the element, so
 * put icons inside it; `loading`, `icon` and `iconRight` apply to real buttons only.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  icon,
  iconRight,
  type = "button",
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot.Root data-slot="button" data-variant={variant} data-size={size} className={buttonVariants({ variant, size, className })} {...props}>
        {children}
      </Slot.Root>
    )
  }
  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonVariants({ variant, size, className })}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" strokeWidth={1.75} className="animate-spin" /> : icon}
      {children}
      {iconRight}
    </button>
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
