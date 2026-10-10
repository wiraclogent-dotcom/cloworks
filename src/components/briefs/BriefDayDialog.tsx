"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { BriefItem, BriefPerson } from "@/lib/briefCalendar";
import { dayLabel } from "@/lib/calendar";
import { StatusBadge } from "../status";
import { IconButton } from "../ui/IconButton";
import { cn, focusRing } from "../ui/cn";

/**
 * One day of the brief calendar: that day's requests grouped by person, "No brief" for anyone who sent none. Native
 * `<dialog>` like `calendar/DayDialog` (focus trap and Esc for free); closing returns focus to the opener.
 */
export function BriefDayDialog({ day, people, items, onClose }: { day: string; people: BriefPerson[]; items: BriefItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (d && !d.open) d.showModal();
    return () => {
      d?.close();
      previous?.focus?.();
    };
  }, []);
  const count = items.length === 1 ? "1 brief" : `${items.length} briefs`;
  return (
    <dialog ref={ref} aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-border bg-background p-0 text-foreground shadow-raised backdrop:bg-[var(--backdrop)]">
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-heading">{dayLabel(day)}</h2>
            <p className="mt-0.5 text-sm text-foreground-secondary tabular-nums">{count}</p>
          </div>
          <IconButton aria-label="Close" icon={<X />} onClick={onClose} />
        </div>
        <div className="space-y-4">
          {people.map((p) => {
            const mine = items.filter((it) => it.requesterId === p.id);
            return (
              <section key={p.id} role="group" aria-label={p.name}>
                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{p.name}</h3>
                {mine.length === 0 ? (
                  <p className="text-sm text-foreground-secondary">No brief</p>
                ) : (
                  <ul className="space-y-1.5">
                    {mine.map((it) => (
                      <li key={it.id} className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-2">
                        <Link href={`/requests/${it.id}`} className={cn("truncate text-sm font-medium text-link hover:underline", focusRing)}>{it.title}</Link>
                        <span className="flex items-center gap-2 text-xs text-foreground-secondary">
                          {it.typeName}
                          <StatusBadge status={it.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}
