import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "./cn";
import { SettingsLink } from "../shell/SettingsLink";

export type Crumb = { label: string; href?: string };

/**
 * The one page header: renders the page `<h1>` (28px/600, ink), an optional count pill and description,
 * an optional view switcher (e.g. <SegmentedControl>) and the page's actions on the right (primary action last).
 */
export function PageHeader({ title, count, description, switcher, actions, breadcrumb, topBarActions, className }: {
  title: ReactNode; count?: number; description?: ReactNode; switcher?: ReactNode; actions?: ReactNode;
  /** Top bar: the trail to this page (the last crumb is the current page). Shown above the title with a hairline under it. */
  breadcrumb?: Crumb[]; /** Right side of the top bar (avatars, icon buttons), before the Settings gear. Only with `breadcrumb`. */ topBarActions?: ReactNode;
  className?: string;
}) {
  const last = (breadcrumb?.length ?? 0) - 1;
  return (
    <>
      {breadcrumb ? (
        <div data-top-bar="" className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-foreground-secondary">
              {breadcrumb.map((c, i) => (
                <li key={`${i}-${c.label}`} className="flex items-center gap-1.5">
                  {i > 0 ? <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-3.5 text-foreground-muted" /> : null}
                  {c.href && i < last ? (
                    <Link href={c.href} className="rounded-sm hover:text-foreground hover:underline underline-offset-2">{c.label}</Link>
                  ) : (
                    <span aria-current={i === last ? "page" : undefined} className={i === last ? "font-medium text-foreground" : undefined}>{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          {/* The gear is the way into Settings (the sidebar does not list it), so every page with a top bar has it. */}
          <div data-top-bar-actions="" className="flex items-center gap-2">{topBarActions}<SettingsLink /></div>
        </div>
      ) : null}
    <div className={cn("mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 pb-4", !breadcrumb && "border-b border-border", className)}>
      {/* Below sm the title takes its own row (actions wrap under it); from sm it shares the row but never shrinks below
          10rem, so a switcher can no longer squeeze it to a few pixels (QA D2/D7). */}
      <div data-page-title="" className="min-w-0 grow basis-full sm:min-w-[10rem] sm:basis-0">
        <div className="flex items-center gap-2">
          <h1 className="text-[28px] leading-9 font-semibold tracking-tight text-heading">{title}</h1>
          {count !== undefined ? (
            <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground-secondary tabular-nums">{count}</span>
          ) : null}
        </div>
        {description ? <p className="mt-1 text-sm text-foreground-secondary">{description}</p> : null}
      </div>
      {switcher || actions ? (
        <div data-page-actions="" className="flex flex-wrap items-center gap-2">
          {switcher}
          {actions}
        </div>
      ) : null}
    </div>
    </>
  );
}
