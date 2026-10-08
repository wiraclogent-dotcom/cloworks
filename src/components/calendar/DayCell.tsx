"use client";

import { useDroppable } from "@dnd-kit/core";
import type { CalendarRow } from "@/lib/requests";
import { dayLabel, splitVisible, type CalendarDay } from "@/lib/calendar";
import { DraggableCalendarCard, StaticCalendarCard } from "../CalendarCard";
import { cn, focusRing } from "../ui/cn";

/**
 * One day of the month grid: a droppable keyed by `YYYY-MM-DD`, up to 3 cards and a "+N more" button.
 * `activeMin` is the dragged card's request day: earlier days are disabled targets while that card is lifted.
 */
export function DayCell({ day, cards, today, canMove, activeMin, activeId, busyId, onMore }: {
  day: CalendarDay; cards: CalendarRow[]; today: string; canMove: boolean;
  activeMin: string | null; activeId: string | null; busyId: string | null; onMore: (day: string) => void;
}) {
  const disabled = activeMin !== null && day.day < activeMin;
  const { setNodeRef, isOver } = useDroppable({ id: day.day, disabled });
  const dragging = activeMin !== null;
  const { shown, more } = splitVisible(cards);
  return (
    <section ref={setNodeRef} aria-label={dayLabel(day.day)} aria-current={day.isToday ? "date" : undefined} data-day={day.day}
      data-drop={dragging ? (disabled ? "invalid" : isOver ? "over" : "valid") : undefined}
      className={cn(
        "flex min-h-28 min-w-0 flex-col rounded-lg border p-1 outline-2 -outline-offset-2 transition-[outline-color,opacity] duration-150",
        day.inMonth ? "bg-surface" : "bg-surface-muted",
        day.isToday ? "border-ring" : "border-border",
        dragging && !disabled && isOver ? "bg-accent outline-ring outline-solid" : "outline-transparent",
        disabled && "opacity-50",
      )}>
      <p className="mb-1 flex items-center gap-1 px-0.5 text-xs">
        <span aria-hidden="true" className={cn(
          "inline-flex size-6 items-center justify-center rounded-full tabular-nums",
          day.isToday ? "bg-accent font-semibold text-accent-foreground" : day.inMonth ? "text-foreground" : "text-foreground-secondary",
        )}>{Number(day.day.slice(8))}</span>
        {day.isToday && <span className="font-medium text-link">Today</span>}
      </p>
      {shown.length > 0 && (
        <ul className="space-y-1">
          {shown.map((c) => canMove
            ? <DraggableCalendarCard key={c.id} card={c} today={today} busy={busyId === c.id} dragging={activeId === c.id} />
            : <StaticCalendarCard key={c.id} card={c} today={today} />)}
        </ul>
      )}
      {more > 0 && (
        <button type="button" aria-haspopup="dialog" onClick={() => onMore(day.day)}
          className={cn("mt-1 self-start rounded-md px-1 py-0.5 text-xs font-medium text-link hover:bg-surface-muted hover:underline", focusRing)}>
          {`+${more} more`}
        </button>
      )}
    </section>
  );
}
