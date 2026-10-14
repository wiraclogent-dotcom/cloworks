import * as React from "react"
import { cn, focusRing } from "@/components/ui/cn"

/** Text field: 36px (`size="sm"` 32px), 8px radius, 3:1 outline. Error state comes from `aria-invalid`. */
function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & { size?: "default" | "sm" }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "block w-full min-w-0 rounded-lg border border-input bg-card text-sm text-foreground placeholder:text-placeholder transition-colors duration-150 ease-out hover:border-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-danger",
        size === "sm" ? "h-8 px-2.5" : "h-9 px-3",
        focusRing,
        className
      )}
      {...props}
    />
  )
}

export { Input }
