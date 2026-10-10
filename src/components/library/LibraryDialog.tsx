"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/components/ui/cn";

/**
 * Local native <dialog> for the Library editors (mounted only while open). showModal() gives the focus trap and Esc;
 * unlike the route Modal, closing just calls `onClose`.
 */
export function LibraryDialog({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-xl border border-border bg-background p-0 text-foreground shadow-raised backdrop:bg-[var(--backdrop)]",
        wide ? "max-w-2xl" : "max-w-lg",
      )}>
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-[22px] font-semibold text-heading">{title}</h2>
          <IconButton aria-label="Close" icon={<X />} onClick={onClose} />
        </div>
        {children}
      </div>
    </dialog>
  );
}
