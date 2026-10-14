"use client";

import type { CalendarRow } from "@/lib/requests";
import { dayLabel } from "@/lib/calendar";
import { StaticCalendarCard } from "../CalendarCard";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";

/**
 * "+N more": every card of one day in a shadcn Dialog (mounted only while open; focus trap and Esc from Radix),
 * without routing. Closing returns focus to the button that opened it.
 */
export function DayDialog({ day, cards, today, onClose }: { day: string; cards: CalendarRow[]; today: string; onClose: () => void }) {
  const count = cards.length === 1 ? "1 request" : `${cards.length} requests`;
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{dayLabel(day)}</DialogTitle>
          <DialogDescription className="tabular-nums">{count}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {cards.map((c) => <StaticCalendarCard key={c.id} card={c} today={today} />)}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
