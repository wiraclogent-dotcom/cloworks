import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { cn } from "@/components/ui/cn"
import { inputClass } from "@/components/shadcn/input"

/**
 * Native `<select>` with the Input look: the browser's own picker (what phones show) and plain form posting, with our
 * chevron. `className` styles the wrapper (width, margin); `selectClassName` the `<select>` itself (e.g. a pill shape).
 * Everything else (`id`, `name`, `aria-*`, `ref`) goes to the `<select>`. Options stay plain `<option>`.
 */
function NativeSelect({
  className,
  selectClassName,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "default" | "sm"; selectClassName?: string }) {
  return (
    <div data-slot="native-select-wrapper" className={cn("relative w-full", className)}>
      <select
        data-slot="native-select"
        className={cn(inputClass(size), "appearance-none pr-8", selectClassName)}
        {...props}
      />
      <ChevronDownIcon
        data-slot="native-select-icon"
        aria-hidden="true"
        className={cn("pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground", size === "sm" ? "right-2.5" : "right-3")}
      />
    </div>
  )
}

export { NativeSelect }
