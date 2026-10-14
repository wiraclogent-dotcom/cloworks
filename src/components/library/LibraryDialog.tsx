"use client";

import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";

/**
 * Local shadcn Dialog for the Library editors (mounted only while open). Radix gives the focus trap, Esc and focus
 * return to the opener; unlike the route Modal, closing just calls `onClose`.
 */
export function LibraryDialog({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent aria-describedby={undefined} className={cn("block", wide ? "max-w-2xl" : "max-w-lg")}>
        <DialogHeader className="mb-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
