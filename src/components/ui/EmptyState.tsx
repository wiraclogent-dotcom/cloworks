import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * Empty list / no results: icon, one-line headline, one sentence, optional action (e.g. a buttonClass link).
 * `titleAs` makes the headline a real heading when the state replaces a whole page (403, not found: `h1`);
 * `role` announces it (e.g. "alert" for access denied).
 */
export function EmptyState({ icon, title, description, action, titleAs: Title = "p", role, className, children }: {
  icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode;
  titleAs?: "p" | "h1" | "h2" | "h3"; role?: "alert" | "status"; className?: string; children?: ReactNode;
}) {
  return (
    <div role={role} className={cn("flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-10 text-center", className)}>
      {icon ? (
        <span aria-hidden="true" className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-muted text-foreground-secondary [&_svg]:size-5">{icon}</span>
      ) : null}
      <Title className={cn("text-base font-semibold text-foreground", Title === "h1" && "text-heading")}>{title}</Title>
      {description ? <p className="mt-1 max-w-md text-sm text-foreground-secondary">{description}</p> : null}
      {children}
      {action ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}
