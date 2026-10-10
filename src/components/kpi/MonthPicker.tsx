"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, focusRing } from "@/components/ui/cn";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const label = (month: string) => `${LONG[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/**
 * Month field for the PageHeader actions: a design-system popover (not the browser's native month input) with a
 * year switcher and a grid of month links. Links work without JS; `user` is kept for leads viewing someone else.
 * Months after `current` (this Jakarta month, from the server) have no data yet and are shown disabled.
 */
export function MonthPicker({ month, current, userId, action }: { month: string; current: string; userId?: string; action: string }) {
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  const ref = useRef<HTMLDetailsElement>(null);
  const href = (m: string) => `${action}?${new URLSearchParams({ month: m, ...(userId ? { user: userId } : {}) })}`;
  const maxYear = Number(current.slice(0, 4));
  // Month links are soft navigations on this same page, so nothing else would close the popover after a pick.
  const close = () => { if (ref.current) ref.current.open = false; };

  // Close on Escape (focus back on the trigger) and on a click outside, like a menu.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) { el.open = false; el.querySelector("summary")?.focus(); }
    };
    const onDown = (e: PointerEvent) => { if (el.open && !el.contains(e.target as Node)) el.open = false; };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown); };
  }, []);

  const yearBtn = cn("inline-flex size-8 items-center justify-center rounded-lg text-foreground-secondary transition-colors duration-150 hover:bg-surface-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40", focusRing);
  const cell = "inline-flex h-9 items-center justify-center rounded-lg text-sm tabular-nums";
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="text-[13px] font-medium text-foreground-secondary">Month</span>
      <details ref={ref} className="group relative" onToggle={(e) => { if (e.currentTarget.open) setYear(Number(month.slice(0, 4))); }}>
        <summary aria-label={`Month: ${label(month)}`}
          className={cn(
            "flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-input bg-surface px-3 text-sm text-foreground tabular-nums shadow-card",
            "transition-colors duration-150 ease-out hover:border-foreground-secondary [&::-webkit-details-marker]:hidden",
            focusRing,
          )}>
          <CalendarDays aria-hidden="true" strokeWidth={1.75} className="size-4 text-foreground-secondary" />
          <span>{label(month)}</span>
          <ChevronDown aria-hidden="true" strokeWidth={1.75} className="size-4 text-foreground-secondary transition-transform duration-150 group-open:rotate-180" />
        </summary>
        <div role="group" aria-label="Choose a month"
          className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-raised">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous year" className={yearBtn} onClick={() => setYear((y) => y - 1)} disabled={year <= 2000}>
              <ChevronLeft aria-hidden="true" strokeWidth={1.75} className="size-4" />
            </button>
            <span aria-live="polite" className="text-sm font-semibold text-heading tabular-nums">{year}</span>
            <button type="button" aria-label="Next year" className={yearBtn} onClick={() => setYear((y) => y + 1)} disabled={year >= maxYear}>
              <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4" />
            </button>
          </div>
          <ul className="grid grid-cols-4 gap-1">
            {SHORT.map((short, i) => {
              const m = `${year}-${String(i + 1).padStart(2, "0")}`;
              if (m > current)
                return <li key={m}><span aria-disabled="true" className={cn(cell, "w-full text-foreground-secondary opacity-40")}>{short}</span></li>;
              const selected = m === month;
              return (
                <li key={m}>
                  <Link href={href(m)} onClick={close} aria-label={label(m)} aria-current={selected ? "true" : undefined} data-this-month={m === current ? "" : undefined}
                    className={cn(
                      cell, "w-full font-medium transition-colors duration-150", focusRing,
                      selected ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-surface-muted",
                      m === current && !selected && "ring-1 ring-ring ring-inset",
                    )}>
                    {short}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex justify-end border-t border-border pt-2">
            <Link href={href(current)} onClick={close} className={cn("rounded-md px-2 py-1 text-[13px] font-medium text-link hover:underline", focusRing)}>This month</Link>
          </div>
        </div>
      </details>
    </div>
  );
}
