import { LoaderCircle } from "lucide-react"
import { cn } from "@/components/ui/cn"

/**
 * Standalone loading indicator, announced as "Loading" (keep any visible "Loading…" text next to it).
 * Pass `aria-hidden="true"` when something else already announces the state (a button label, a status line).
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const hidden = props["aria-hidden"] === true || props["aria-hidden"] === "true"
  return (
    <LoaderCircle
      {...(hidden ? {} : { role: "status", "aria-label": "Loading" })}
      data-slot="spinner"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
