import { cn } from "@/components/ui/cn"

/**
 * Loading placeholder block. Size it with className (`h-4 w-40`; `rounded-full` / `rounded-xl` for other shapes).
 * Hidden from assistive tech: pair it with a text status where the wait matters.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      data-skeleton=""
      className={cn("animate-pulse rounded-md bg-border", className)}
      {...props}
    />
  )
}

export { Skeleton }
