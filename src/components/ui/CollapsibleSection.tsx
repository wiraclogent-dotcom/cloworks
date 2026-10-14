"use client";

import { Card } from "@/components/shadcn/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/shadcn/collapsible";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn, focusRing } from "./cn";

/**
 * A card with a Collapsible inside: closed by default, the heading row ("Title (n)") is the trigger (an `<h2>` holding
 * the full-width button). The body is rendered once and only hidden while closed (`keepMounted`), so its state
 * survives toggling and it is in the server HTML, as with the old details disclosure.
 * Open or closed is remembered per `storageKey` in localStorage; the server render is always closed and a stored
 * "open" applies after mount. Storage may be missing or blocked (private window): everything still works, just
 * unremembered.
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
      <Collapsible data-closed-section={id} open={open}
        onOpenChange={(next) => {
          setOpen(next);
          try { localStorage.setItem(storageKey, next ? "1" : "0"); } catch { /* storage unavailable */ }
        }}>
        <h2 className="text-base font-semibold text-heading">
          <CollapsibleTrigger className={cn("flex w-full cursor-pointer items-center gap-2 bg-muted px-4 py-2.5 text-left select-none hover:bg-muted/70", focusRing, "focus-visible:-outline-offset-2")}>
            <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-90 motion-reduce:transition-none" />
            {`${title} (${count})`}
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent keepMounted className="border-t border-border">{children}</CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
