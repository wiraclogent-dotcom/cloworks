"use client";

import { useDraggable } from "@dnd-kit/core";
import type { RequestRow } from "@/lib/requests";
import Link from "next/link";
import { NeedsMotionBadge, deadlineText } from "./status";

/** The card's visible content. `interactive=false` is the drag overlay copy (no links, hidden from assistive tech). */
export function CardFace({ card, interactive = true, handle }: { card: RequestRow; interactive?: boolean; handle?: React.ReactNode }) {
  const open = card.status !== "DONE" && card.status !== "CANCELLED";
  const overdue = open && card.daysLeft !== null && card.daysLeft < 0;
  return (
    <>
      <div className="flex items-start gap-2">
        {handle}
        <p className="font-medium break-words">
          {interactive ? (
            <Link href={`/requests/${card.id}`} draggable={false} className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{card.title}</Link>
          ) : card.title}
        </p>
      </div>
      {card.needsMotion && <p className="mt-1"><NeedsMotionBadge /></p>}
      <p className="mt-1 text-xs text-muted-foreground">{card.brandName} · {card.divisionName}</p>
      <p className="mt-1 text-xs">Requester: {card.requesterName}</p>
      <p className="text-xs">{card.assigneeName ? `Assignee: ${card.assigneeName}` : "Unassigned"}</p>
      {open && (
        <p className="mt-1 text-xs font-medium">
          {overdue && <span aria-hidden="true">⚠ </span>}
          {deadlineText(card.daysLeft)}
        </p>
      )}
    </>
  );
}

/**
 * Board card. For movers the WHOLE card is the pointer/touch drag surface (listeners on the root; a 6px mouse
 * distance or a 250ms touch hold keeps the title link clickable and the page scrollable). The small handle button
 * remains the keyboard and screen-reader entry point (dnd-kit only starts a keyboard drag from the activator node,
 * so Enter on the title link still just follows the link). Read-only users get no listeners and no handle.
 */
export function BoardCard({ card, canMove, busy, dragging }: { card: RequestRow; canMove: boolean; busy: boolean; dragging: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id: card.id, disabled: !canMove || busy });
  return (
    <li ref={setNodeRef} data-card={card.id} data-draggable={canMove ? "true" : undefined} {...(canMove ? listeners : undefined)}
      className={`rounded-md border border-border bg-card p-3 text-sm text-card-foreground ${canMove ? "cursor-grab touch-manipulation active:cursor-grabbing" : ""} ${dragging ? "opacity-40" : busy ? "opacity-60" : ""}`}>
      <CardFace card={card}
        handle={canMove ? (
          <button type="button" ref={setActivatorNodeRef} {...attributes} aria-label={`Drag “${card.title}”`} disabled={busy}
            className="-ml-1 cursor-grab touch-none rounded px-1 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <span aria-hidden="true">⋮⋮</span>
          </button>
        ) : undefined} />
    </li>
  );
}
