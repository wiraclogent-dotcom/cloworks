import * as React from "react"
import { cn, focusRing } from "@/components/ui/cn"

/** Multi-line field: at least 96px tall. Error state comes from `aria-invalid`. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "block min-h-24 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-placeholder transition-colors duration-150 ease-out hover:border-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 aria-invalid:border-danger",
        focusRing,
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
