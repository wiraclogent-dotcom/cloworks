"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";
import { cn } from "./cn";

/**
 * Route modal for intercepted routes (`@modal/(.)…`). Native `<dialog>` gives the focus trap and Esc;
 * closing (Esc, backdrop, X) goes back in history so the URL returns to the page underneath.
 * `side="right"` renders a full-height panel sliding in from the right (full width on phones) with a sticky
 * header bar, for content that has its own page heading; `actions` sit next to the close button.
 */
export function Modal({ title, description, children, className, side = "center", actions }: {
  title: string; description?: string; children: ReactNode; className?: string; side?: "center" | "right"; actions?: ReactNode;
}) {
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

  const close = <IconButton aria-label="Close" icon={<X />} onClick={() => router.back()} />;
  return (
    <dialog ref={ref} aria-labelledby="modal-title" aria-describedby={description ? "modal-desc" : undefined}
      onCancel={(e) => { e.preventDefault(); router.back(); }}
      onClick={(e) => { if (e.target === e.currentTarget) router.back(); }}
      className={cn(
        "overflow-y-auto border-border bg-background p-0 text-foreground shadow-raised backdrop:bg-[var(--backdrop)]",
        side === "right"
          ? "m-0 ml-auto h-dvh max-h-dvh w-full max-w-none border-l sm:w-[min(64rem,92vw)] lg:w-[62vw]"
          : "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl rounded-xl border",
        className,
      )}>
      {side === "right" ? (
        <>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
            <h2 id="modal-title" className="text-sm font-semibold text-foreground-secondary">{title}</h2>
            <div className="flex items-center gap-1">{actions}{close}</div>
          </div>
          <div className="p-4 sm:p-6">{children}</div>
        </>
      ) : (
        <div className="p-4 sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="modal-title" className="text-[22px] font-semibold text-heading">{title}</h2>
              {description && <p id="modal-desc" className="mt-1 text-foreground-secondary">{description}</p>}
            </div>
            <div className="flex items-center gap-1">{actions}{close}</div>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
