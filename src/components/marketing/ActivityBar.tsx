"use client";

import { Check } from "lucide-react";
import type { Segment } from "@/lib/marketing/layout";
import type { CalActivity, CalDivision } from "@/lib/marketing/types";
import { activityLabel } from "@/lib/marketing/format";
import { cn, focusRing } from "../ui/cn";

const STATUS_CLASS: Record<CalActivity["status"], string> = {
  CONFIRMED: "border border-tone-accent bg-tone-tint text-tone-text",
  DONE: "border border-tone-accent bg-tone-tint text-tone-text",
  PLANNED: "border border-dashed border-tone-accent bg-card text-foreground",
  CANCELLED: "border border-dashed border-tone-accent bg-card text-muted-foreground line-through",
};

/** One activity's bar in a week lane: tinted by its division, drawn by status (solid, dashed, ✓, struck through). */
export function ActivityBar({ activity: a, division, segment, onOpen }: {
  activity: CalActivity; division: CalDivision; segment: Segment; onOpen: () => void;
}) {
  return (
    <button type="button" data-tone={division.tone} data-status={a.status} aria-label={activityLabel(division.name, a)} title={a.title} onClick={onOpen}
      className={cn(
        "flex h-5.5 w-full min-w-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs leading-none font-medium transition-[filter] duration-150 hover:brightness-95",
        STATUS_CLASS[a.status],
        segment.continuesLeft && "rounded-l-none border-l-0",
        segment.continuesRight && "rounded-r-none border-r-0",
        focusRing,
      )}>
      {a.status === "DONE" ? <Check aria-hidden="true" strokeWidth={2} className="size-3 shrink-0" /> : null}
      <span className="truncate">{a.title}</span>
    </button>
  );
}
