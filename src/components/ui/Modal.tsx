"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "./cn";
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Sheet, SheetCloseButton, SheetContent, SheetHeader, SheetTitle } from "@/components/shadcn/sheet";

/**
 * Route modal for intercepted routes (`@modal/(.)…`): a centred shadcn Dialog, or with `side="right"` a Sheet docked
 * on the right (full width on phones) with a sticky header bar, for content that has its own page heading.
 * Closing (Esc, the overlay, X) goes back in history once so the URL returns to the page underneath; `actions` sit
 * next to the close button. Radix gives the focus trap, the scroll lock and focus return.
 */
export function Modal({ title, description, children, className, side = "center", actions }: {
  title: string; description?: string; children: ReactNode; className?: string; side?: "center" | "right"; actions?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Next keeps a left route mounted but hidden (React Activity), which runs this cleanup: close there so a hidden
  // route never keeps its overlay, focus trap or scroll lock, and open again when the route is shown (browser Back).
  // The effect lifecycle is the only signal for that, hence state set in an effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
    return () => setOpen(false);
  }, []);

  // Close locally too, so a second Esc or click while the navigation is in flight does not go back twice.
  function onOpenChange(next: boolean) {
    if (next) return;
    setOpen(false);
    router.back();
  }

  if (side === "right") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" showClose={false} aria-describedby={undefined}
          className={cn("sm:w-[min(64rem,92vw)] sm:max-w-none lg:w-[62vw]", className)}>
          {/* A toolbar label, not a heading the page competes with: the content brings its own h1. */}
          <SheetHeader className="sticky top-0 z-10 flex-row items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
            <SheetTitle className="text-sm font-semibold text-muted-foreground">{title}</SheetTitle>
            <div className="flex items-center gap-1">{actions}<SheetCloseButton /></div>
          </SheetHeader>
          <div className="p-4 sm:p-6">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose={false} {...(description ? {} : { "aria-describedby": undefined })}
        className={cn("block max-w-3xl", className)}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="flex items-center gap-1">{actions}<DialogCloseButton /></div>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}
