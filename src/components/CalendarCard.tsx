"use client";

import { useDraggable } from "@dnd-kit/core";
import Link from "next/link";
import { GripVertical } from "lucide-react";
import type { CalendarRow } from "@/lib/requests";
import { brandTone } from "@/lib/palette";
import { STATUS_LABEL, StatusIcon } from "./status";
import { Avatar, UnassignedAvatar } from "./ui/Avatar";
import { cn, focusRing } from "./ui/cn";

const CARD_SHAPE = "rounded-lg border border-l-4 border-l-tone-accent bg-card p-1.5 text-xs text-card-foreground";
/** The drag overlay copy: same card, Aqua outline and the raised shadow. */
export const CALENDAR_CARD_OVERLAY = `${CARD_SHAPE} border-ring shadow-raised`;

const isOverdue = (card: CalendarRow, today: string) => card.deadlineDay !== null && card.deadlineDay < today;

/** Overdue cards take the overdue tone; the rest show their brand on the left edge. */
export function cardTone(card: CalendarRow, today: string) {
  return isOverdue(card, today) ? "overdue" : brandTone(card.brandName);
}

/** The compact card content: status icon, title (2 lines), Overdue / No deadline label, assignee avatar. */
export function CalendarCardFace({ card, today, interactive = true, handle }: { card: CalendarRow; today: string; interactive?: boolean; handle?: React.ReactNode }) {
  const assignee = card.assigneeName ? `Assignee: ${card.assigneeName}` : "Assignee: Unassigned";
  return (
    <>
      <div className="flex items-start gap-1">
        <span className="mt-0.5 inline-flex shrink-0 text-foreground-secondary" title={STATUS_LABEL[card.status]}>
          <StatusIcon status={card.status} />
          <span className="sr-only">{`Status: ${STATUS_LABEL[card.status]}. `}</span>
        </span>
        <p className="line-clamp-2 min-w-0 flex-1 leading-4 font-medium break-words text-foreground">
          {interactive ? (
            <Link href={`/requests/${card.id}`} draggable={false} className={cn("rounded-sm underline-offset-2 hover:underline", focusRing)}>{card.title}</Link>
          ) : card.title}
        </p>
        {handle}
      </div>
      <div className="mt-1 flex items-center justify-between gap-1">
        {isOverdue(card, today) ? (
          <span className="rounded-md bg-tone-tint px-1.5 py-px font-medium text-tone-text">Overdue</span>
        ) : card.deadlineDay === null ? (
          <span className="text-foreground-secondary">No deadline</span>
        ) : <span />}
        <span className="inline-flex shrink-0" title={assignee} aria-label={assignee} role="img">
          {card.assigneeName ? <Avatar name={card.assigneeName} size="sm" decorative /> : <UnassignedAvatar size="sm" decorative />}
        </span>
      </div>
    </>
  );
}

function cardClass(card: CalendarRow) {
  return cn(CARD_SHAPE, "border-border shadow-card", card.deadlineDay === null && "border-dashed border-border-strong");
}

/** A card without dragging: read-only users, the "+N more" dialog and the narrow agenda. */
export function StaticCalendarCard({ card, today }: { card: CalendarRow; today: string }) {
  return (
    <li data-card={card.id} data-tone={cardTone(card, today)} className={cardClass(card)}>
      <CalendarCardFace card={card} today={today} />
    </li>
  );
}

/**
 * Draggable card (movers, desktop grid). As on the board, the whole card is the pointer/touch surface (6px mouse
 * distance / 250ms hold keep the link clickable and the page scrollable) and the handle is the keyboard entry point.
 */
export function DraggableCalendarCard({ card, today, busy, locked, dragging }: { card: CalendarRow; today: string; busy: boolean; locked: boolean; dragging: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id: card.id, disabled: busy || locked });
  return (
    <li ref={setNodeRef} data-card={card.id} data-tone={cardTone(card, today)} data-draggable="true" {...listeners}
      className={cn(
        "group/card", cardClass(card), "cursor-grab touch-manipulation transition-[border-color,opacity] duration-150 hover:border-border-strong active:cursor-grabbing",
        dragging ? "opacity-40" : busy ? "opacity-60" : "",
      )}>
      <CalendarCardFace card={card} today={today}
        handle={
          <button type="button" ref={setActivatorNodeRef} {...attributes} aria-label={`Drag “${card.title}”`} disabled={busy}
            className={cn(
              "-mt-0.5 -mr-0.5 inline-flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-foreground-secondary transition-opacity duration-150",
              "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-surface-muted",
              focusRing,
            )}>
            <GripVertical aria-hidden="true" strokeWidth={1.75} className="size-3.5" />
          </button>
        } />
    </li>
  );
}
