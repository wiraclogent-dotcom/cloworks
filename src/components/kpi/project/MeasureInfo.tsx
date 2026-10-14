"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";

const HOVER_CLOSE_MS = 150;

/**
 * Small info button beside a measure's label. A popover (not a tooltip) so it also opens on tap: mouse hover opens and
 * leaving closes after a short delay (so the pointer can move onto the text), a click while hover-open pins it, otherwise click toggles, and Tab / Enter / Space / Esc work from the keyboard.
 */
export function MeasureInfo({ label, weight, help }: { label: string; weight: number; help: string }) {
  const [open, setOpen] = useState(false);
  // True while the popover is open only because the mouse is over it; a click then pins it open instead of toggling it shut.
  const hoverOpened = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  useEffect(() => cancelClose, []);

  const onEnter = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    cancelClose();
    if (!open) { hoverOpened.current = true; setOpen(true); }
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !hoverOpened.current) return;
    cancelClose();
    timer.current = setTimeout(() => { timer.current = null; hoverOpened.current = false; setOpen(false); }, HOVER_CLOSE_MS);
  };
  const onClick = (e: MouseEvent) => {
    if (!hoverOpened.current) return; // otherwise Radix toggles as usual
    e.preventDefault(); // skip Radix's toggle: keep it open
    hoverOpened.current = false;
    cancelClose();
  };
  const onOpenChange = (next: boolean) => {
    cancelClose();
    if (!next) hoverOpened.current = false;
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${label}?`}
          onPointerEnter={onEnter}
          onPointerLeave={onLeave}
          onClick={onClick}
          className="relative inline-flex shrink-0 after:absolute after:-inset-[5px] after:content-[''] cursor-pointer items-center justify-center rounded-full align-middle text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-72 space-y-1.5 p-3 text-xs" onPointerEnter={onEnter} onPointerLeave={onLeave}>
        <p className="text-sm font-medium text-heading">{label} · {Math.round(weight * 100)}%</p>
        <p>{help}</p>
        <p className="text-muted-foreground">— means there&apos;s no data yet. This measure&apos;s weight is shared among the others.</p>
      </PopoverContent>
    </Popover>
  );
}
