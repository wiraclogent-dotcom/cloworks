import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/** White surface, 12px radius, hairline border, soft shadow. `padded={false}` for tables that run edge to edge. */
export function Card({ padded = true, className, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div {...rest} className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-card", padded && "p-4", className)} />;
}

/** Title row of a card: title (and optional description) left, `actions` right. */
export function CardHeader({ actions, className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { actions?: ReactNode }) {
  return (
    <div {...rest} className={cn("mb-3 flex flex-wrap items-start justify-between gap-2", className)}>
      <div className="min-w-0">{children}</div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Section title inside a card: 16px/600. Renders an h2 by default (`as="h3"` when nested deeper). */
export function CardTitle({ as: Tag = "h2", className, ...rest }: HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" }) {
  return <Tag {...rest} className={cn("text-base font-semibold text-foreground", className)} />;
}
