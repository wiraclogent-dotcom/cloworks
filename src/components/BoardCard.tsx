"use client";

import { useDraggable } from "@dnd-kit/core";
import type { RequestStatus } from "@prisma/client";
import type { RequestRow } from "@/lib/requests";
import { canTransition } from "@/lib/workflow";
import Link from "next/link";
import { MOVE_TARGETS, STATUS_LABEL, deadlineText } from "./status";

export function BoardCard({ card, canMove, busy, onMove }: {
  card: RequestRow; canMove: boolean; busy: boolean; onMove: (card: RequestRow, to: RequestStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, disabled: !canMove || busy });
  const legal = MOVE_TARGETS.filter((s) => canTransition(card.status, s));
  const open = card.status !== "DONE" && card.status !== "CANCELLED";
  const overdue = open && card.daysLeft !== null && card.daysLeft < 0;
  return (
    <li ref={setNodeRef} data-card={card.id}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`rounded-md border bg-card p-3 text-sm text-card-foreground ${isDragging ? "relative z-10 border-ring shadow-lg" : "border-border"} ${busy ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-2">
        {canMove && (
          <button type="button" {...attributes} {...listeners} aria-label={`Drag “${card.title}”`} disabled={busy}
            className="-ml-1 cursor-grab touch-none rounded px-1 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
            <span aria-hidden="true">⋮⋮</span>
          </button>
        )}
        <p className="font-medium break-words"><Link href={`/requests/${card.id}`} className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{card.title}</Link></p>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{card.brandName} · {card.divisionName}</p>
      <p className="mt-1 text-xs">Requester: {card.requesterName}</p>
      <p className="text-xs">{card.assigneeName ? `Assignee: ${card.assigneeName}` : "Unassigned"}</p>
      {open && (
        <p className="mt-1 text-xs font-medium">
          {overdue && <span aria-hidden="true">⚠ </span>}
          {deadlineText(card.daysLeft)}
        </p>
      )}
      {canMove && legal.length > 0 && (
        <select aria-label={`Move “${card.title}” to…`} value="" disabled={busy}
          onChange={(e) => { if (e.target.value) onMove(card, e.target.value as RequestStatus); }}
          className="mt-2 w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-ring">
          <option value="">Move to…</option>
          {legal.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      )}
    </li>
  );
}
