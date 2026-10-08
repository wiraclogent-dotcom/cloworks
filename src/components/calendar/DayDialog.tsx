"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { CalendarRow } from "@/lib/requests";
import { dayLabel } from "@/lib/calendar";
import { StaticCalendarCard } from "../CalendarCard";
import { IconButton } from "../ui/IconButton";

/**
 * "+N more": every card of one day in a native `<dialog>` (focus trap and Esc for free), styled like `ui/Modal` but
 * without routing. Closing returns focus to the button that opened it.
 */
export function DayDialog({ day, cards, today, onClose }: { day: string; cards: CalendarRow[]; today: string; onClose: () => void }) {
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
  const count = cards.length === 1 ? "1 request" : `${cards.length} requests`;
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
        <ul className="space-y-2">
          {cards.map((c) => <StaticCalendarCard key={c.id} card={c} today={today} />)}
        </ul>
      </div>
    </dialog>
  );
}
