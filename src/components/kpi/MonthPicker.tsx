"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { cn, focusRing } from "@/components/ui/cn";
import { kpiHref } from "@/lib/kpi/href";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const label = (month: string) => `${LONG[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/**
 * Month field for the PageHeader actions: a design-system popover (not the browser's native month input) with a
 * year switcher and a grid of month links (plain links); `user` is kept for leads viewing someone else, and
 * `keep` carries the other params of the page (the Projects section's year and quarter) so a month change leaves them be.
 * Months after `current` (this Jakarta month, from the server) have no data yet and are shown disabled.
 */
export function MonthPicker({ month, current, userId, action, keep }: {
  month: string; current: string; userId?: string; action: string; keep?: Record<string, string | undefined>;
}) {
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const [open, setOpen] = useState(false);
  // `month` and `user` are the picker's own: keep can add to them but never override them.
  const rest = Object.fromEntries(Object.entries(keep ?? {}).filter(([k]) => k !== "month" && k !== "user"));
  const href = (m: string) => kpiHref(action, { month: m, ...rest, user: userId });
  const maxYear = Number(current.slice(0, 4));
  // Month links are soft navigations on this same page, so nothing else would close the popover after a pick.
  const close = () => setOpen(false);
  // Esc (focus back on the trigger) and a click outside close it too (Radix Popover). Opening shows the chosen month's year.
  const onOpenChange = (next: boolean) => { if (next) setYear(Number(month.slice(0, 4))); setOpen(next); };

  const cell = "inline-flex h-9 items-center justify-center rounded-lg text-sm tabular-nums";
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="text-compact font-medium text-muted-foreground">Month</span>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger aria-label={`Month: ${label(month)}`}
          className={cn(
            "group flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm text-foreground tabular-nums shadow-card",
            "transition-colors duration-150 ease-out hover:border-muted-foreground",
            focusRing,
          )}>
          <CalendarDays aria-hidden="true" strokeWidth={1.75} className="size-4 text-muted-foreground" />
          <span>{label(month)}</span>
          <ChevronDown aria-hidden="true" strokeWidth={1.75} className="size-4 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-180" />
        </PopoverTrigger>
        <PopoverContent role="group" aria-label="Choose a month" align="end" sideOffset={8} collisionPadding={16} className="w-64 p-3">
          <div className="mb-2 flex items-center justify-between">
            <Button variant="ghost" size="icon-sm" aria-label="Previous year" className="[&_svg]:size-4" onClick={() => setYear((y) => y - 1)} disabled={year <= 2000}>
              <ChevronLeft aria-hidden="true" strokeWidth={1.75} />
            </Button>
            <span aria-live="polite" className="text-sm font-semibold text-heading tabular-nums">{year}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Next year" className="[&_svg]:size-4" onClick={() => setYear((y) => y + 1)} disabled={year >= maxYear}>
              <ChevronRight aria-hidden="true" strokeWidth={1.75} />
            </Button>
          </div>
          <ul className="grid grid-cols-4 gap-1">
            {SHORT.map((short, i) => {
              const m = `${year}-${String(i + 1).padStart(2, "0")}`;
              if (m > current)
                return <li key={m}><span aria-disabled="true" className={cn(cell, "w-full text-muted-foreground opacity-55")}>{short}</span></li>;
              const selected = m === month;
              return (
                <li key={m}>
                  <Link href={href(m)} onClick={close} aria-label={label(m)} aria-current={selected ? "true" : undefined} data-this-month={m === current ? "" : undefined}
                    className={cn(
                      cell, "w-full font-medium transition-colors duration-150", focusRing,
                      selected ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted",
                      m === current && !selected && "ring-1 ring-ring ring-inset",
                    )}>
                    {short}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex justify-end border-t border-border pt-2">
            <Link href={href(current)} onClick={close} className={cn("rounded-md px-2 py-1 text-compact font-medium text-link hover:underline", focusRing)}>This month</Link>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
