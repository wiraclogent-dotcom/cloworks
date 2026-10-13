"use client";

import { useState, type PointerEvent } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";

/**
 * Small info button beside a measure's label. A popover (not a tooltip) so it also opens on tap: mouse hover opens and
 * leaves closes, click toggles, and Tab / Enter / Space / Esc work from the keyboard.
 */
export function MeasureInfo({ label, weight, help }: { label: string; weight: number; help: string }) {
  const [open, setOpen] = useState(false);
  const onEnter = (e: PointerEvent) => { if (e.pointerType === "mouse") setOpen(true); };
  const onLeave = (e: PointerEvent) => { if (e.pointerType === "mouse") setOpen(false); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What is ${label}?`}
          onPointerEnter={onEnter}
          onPointerLeave={onLeave}
          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full align-middle text-foreground-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-72 space-y-1.5 p-3 text-xs" onPointerEnter={onEnter} onPointerLeave={onLeave}>
        <p className="text-sm font-medium text-heading">{label} · {Math.round(weight * 100)}%</p>
        <p>{help}</p>
        <p className="text-foreground-secondary">— means there&apos;s no data yet. This measure&apos;s weight is shared among the others.</p>
      </PopoverContent>
    </Popover>
  );
}
