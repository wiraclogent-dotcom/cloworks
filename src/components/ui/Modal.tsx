"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { cn } from "./cn";

/**
 * Route modal for intercepted routes (`@modal/(.)…`). Native `<dialog>` gives the focus trap and Esc;
 * closing (Esc, backdrop, X) goes back in history so the URL returns to the page underneath.
 */
export function Modal({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  // Next keeps a left route mounted but hidden (React Activity), which runs this cleanup; close the dialog there
  // so a hidden one never stays in the top layer, and reopen when the route is shown again.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    document.documentElement.style.overflow = "hidden";
    return () => {
      d?.close();
      document.documentElement.style.overflow = "";
    };
  }, []);

  return (
    <dialog ref={ref} aria-labelledby="modal-title" aria-describedby={description ? "modal-desc" : undefined}
      onCancel={(e) => { e.preventDefault(); router.back(); }}
      onClick={(e) => { if (e.target === e.currentTarget) router.back(); }}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border border-border bg-background p-0 text-foreground shadow-raised backdrop:bg-[var(--backdrop)]",
        className,
      )}>
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="modal-title" className="text-[22px] font-semibold text-heading">{title}</h2>
            {description && <p id="modal-desc" className="mt-1 text-foreground-secondary">{description}</p>}
          </div>
          <IconButton aria-label="Close" icon={<X />} onClick={() => router.back()} />
        </div>
        {children}
      </div>
    </dialog>
  );
}
