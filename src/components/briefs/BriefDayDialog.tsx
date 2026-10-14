"use client";

import Link from "next/link";
import type { BriefItem } from "@/lib/briefCalendar";
import { dayLabel } from "@/lib/calendar";
import { StatusBadge } from "../status";
import { cn, focusRing } from "../ui/cn";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";

/**
 * One day of the brief calendar: that day's requests grouped by who sent them, in order of their first brief. shadcn
 * Dialog like `calendar/DayDialog` (focus trap and Esc from Radix); closing returns focus to the opener.
 */
export function BriefDayDialog({ day, items, onClose }: { day: string; items: BriefItem[]; onClose: () => void }) {
  const count = items.length === 1 ? "1 brief" : `${items.length} briefs`;
  const groups = new Map<string, { name: string; items: BriefItem[] }>();
  for (const it of items) (groups.get(it.requesterId) ?? groups.set(it.requesterId, { name: it.requesterName, items: [] }).get(it.requesterId)!).items.push(it);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{dayLabel(day)}</DialogTitle>
          <DialogDescription className="tabular-nums">{count}</DialogDescription>
        </DialogHeader>
        {groups.size === 0 ? (
          <p className="text-sm text-muted-foreground">No briefs this day.</p>
        ) : (
          <div className="space-y-4">
            {[...groups].map(([id, g]) => (
              <section key={id} role="group" aria-label={g.name}>
                <h3 className="mb-1.5 text-sm font-semibold text-foreground">{g.name}</h3>
                <ul className="space-y-1.5">
                  {g.items.map((it) => (
                    <li key={it.id} className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-2">
                      <Link href={`/requests/${it.id}`} className={cn("truncate text-sm font-medium text-link hover:underline", focusRing)}>{it.title}</Link>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {it.typeName}
                        <StatusBadge status={it.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
