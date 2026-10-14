import type { ReactNode } from "react";
import { ScrollIntoViewOnMount } from "./ScrollIntoViewOnMount";

/**
 * One section of a KPI page (Requests, Projects): the title (h2) on the left, the section's own controls on the
 * right (they wrap under the title on narrow screens), the content below. `id` is the anchor (`#projects`).
 */
export function KpiSection({ id, title, controls, autoScroll = false, children }: {
  id: string; title: string; controls?: ReactNode; autoScroll?: boolean; children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={`${id}-title`} className="text-base font-semibold text-heading">{title}</h2>
        {controls ? <div className="flex flex-wrap items-center gap-2">{controls}</div> : null}
      </div>
      {children}
      {autoScroll ? <ScrollIntoViewOnMount targetId={id} /> : null}
    </section>
  );
}
