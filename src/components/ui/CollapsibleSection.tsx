"use client";

import { Card } from "@/components/shadcn/card";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn, focusRing } from "./cn";

/**
 * A card with a native `<details>` inside: closed by default, the summary row is the heading ("Title (n)"). Open or
 * closed is remembered per `storageKey` in localStorage; the server render is always closed and a stored "open"
 * applies after mount. Storage may be missing or blocked (private window): everything still works, just unremembered.
 */
export function CollapsibleSection({ id, storageKey, title, count, children, className }: {
  /** Hook for tests and styling (`data-closed-section`). */
  id: string; storageKey: string; title: string; count: number; children: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      // Restoring a stored preference after mount is the point of this effect (SSR is always closed).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(storageKey) === "1") setOpen(true);
    } catch { /* storage unavailable */ }
  }, [storageKey]);
  return (
    <Card asChild className={cn("group overflow-hidden p-0", className)}>
    <details data-closed-section={id} open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        setOpen(next);
        try { localStorage.setItem(storageKey, next ? "1" : "0"); } catch { /* storage unavailable */ }
      }}>
      <summary className={cn("flex cursor-pointer list-none items-center gap-2 bg-muted px-4 py-2.5 select-none hover:bg-muted/70 [&::-webkit-details-marker]:hidden", focusRing, "focus-visible:-outline-offset-2")}>
        <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
        <h2 className="text-base font-semibold text-heading">{`${title} (${count})`}</h2>
      </summary>
      <div className="border-t border-border">{children}</div>
    </details>
    </Card>
  );
}
