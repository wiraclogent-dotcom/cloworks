import { use, type ReactNode } from "react";
import { cn, focusRing } from "@/components/ui/cn";

/** Plain <a> (not next/link) so it does a full load and lands on the real detail page instead of the intercepted panel. */
export function OpenFullPage({ params, icon }: { params: Promise<{ id: string }>; icon: ReactNode }) {
  const { id } = use(params);
  return (
    <a href={`/requests/${id}`} title="Open full page" aria-label="Open full page"
      className={cn("inline-flex size-9 items-center justify-center rounded-lg text-foreground-secondary hover:bg-surface-muted hover:text-foreground [&_svg]:size-[18px]", focusRing)}>
      {icon}
    </a>
  );
}
