import type { ReactNode } from "react";
import { Card } from "@/components/shadcn/card";
import { cn } from "./cn";

/**
 * One number in a row of summary cards (V3): small icon + label, the value, an optional hint. Renders an `<li>`, so put
 * it in a `<ul>` grid with a gap. `solid` is the lead card of the row: solid blue with white text (one per row).
 */
export function StatCard({ icon, label, value, hint, solid = false, className, ...rest }: {
  icon: ReactNode; label: ReactNode; value: ReactNode; hint?: ReactNode; solid?: boolean; className?: string; "data-kpi"?: string;
}) {
  return (
    <Card asChild className={cn("flex min-w-0 flex-col gap-2 p-4 shadow-none", solid && "border-primary bg-primary text-primary-foreground", className)}>
      <li {...rest}>
        <span className={cn("flex items-center gap-1.5 text-compact", solid ? "text-primary-foreground/90" : "text-muted-foreground")}>
          <span aria-hidden="true" className={cn("[&_svg]:size-3.5", solid ? "text-primary-foreground" : "text-foreground-muted")}>{icon}</span>
          {label}
        </span>
        <span className={cn("text-2xl leading-8 font-semibold tabular-nums", solid ? "text-primary-foreground" : "text-foreground")}>{value}</span>
        {hint ? <span className={cn("text-xs leading-4", solid ? "text-primary-foreground/90" : "text-muted-foreground")}>{hint}</span> : null}
      </li>
    </Card>
  );
}
