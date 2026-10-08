import { cn } from "./cn";

/** Loading placeholder block. Size it with className (e.g. "h-4 w-40"). Hidden from assistive tech: pair with a text status. */
export function Skeleton({ className, rounded = "md" }: { className?: string; rounded?: "md" | "full" | "xl" }) {
  return (
    <div aria-hidden="true" data-skeleton=""
      className={cn("animate-pulse bg-border", rounded === "full" ? "rounded-full" : rounded === "xl" ? "rounded-xl" : "rounded-md", className)} />
  );
}
