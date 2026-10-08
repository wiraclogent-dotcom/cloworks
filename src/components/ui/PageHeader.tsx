import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * The one page header: renders the page `<h1>` (22px/600, Deep Blue), an optional count pill and description,
 * an optional view switcher (e.g. <SegmentedControl>) and the page's actions on the right (primary action last).
 */
export function PageHeader({ title, count, description, switcher, actions, className }: {
  title: ReactNode; count?: number; description?: ReactNode; switcher?: ReactNode; actions?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-center gap-x-4 gap-y-3", className)}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] leading-7 font-semibold text-heading">{title}</h1>
          {count !== undefined ? (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground-secondary tabular-nums">{count}</span>
          ) : null}
        </div>
        {description ? <p className="mt-1 text-sm text-foreground-secondary">{description}</p> : null}
      </div>
      {switcher || actions ? (
        <div className="flex flex-wrap items-center gap-2">
          {switcher}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
