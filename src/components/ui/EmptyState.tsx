import type { ReactNode } from "react";
import { cn } from "./cn";

/** Empty list / no results: icon, one-line headline, one sentence, optional action (e.g. a buttonClass link). */
export function EmptyState({ icon, title, description, action, className }: {
  icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center", className)}>
      {icon ? (
        <span aria-hidden="true" className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-muted text-foreground-secondary [&_svg]:size-5">{icon}</span>
      ) : null}
      <p className="text-base font-semibold text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-foreground-secondary">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
