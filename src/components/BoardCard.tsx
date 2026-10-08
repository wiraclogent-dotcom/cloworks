"use client";

import { useDraggable } from "@dnd-kit/core";
import type { RequestRow } from "@/lib/requests";
import Link from "next/link";
import { GripVertical, Link2 } from "lucide-react";
import { BrandTag } from "./ui/Chip";
import { DeadlineChip } from "./ui/DeadlineChip";
import { NeedsMotionChip } from "./ui/NeedsMotionChip";
import { Avatar, UnassignedAvatar } from "./ui/Avatar";
import { cn, focusRing } from "./ui/cn";

const CARD_SHAPE = "rounded-xl border bg-card p-4 text-sm text-card-foreground";
/** Card in its column: white, 12px radius, a whisper of a hairline and a soft shadow. */
export const CARD_SURFACE = `${CARD_SHAPE} border-border/70 shadow-card`;
/** The drag overlay copy: same card, Aqua outline and the raised shadow. */
export const CARD_OVERLAY = `${CARD_SHAPE} border-ring shadow-raised`;

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" });

/**
 * The card's visible content, laid out like the reference: a code row (link icon + short request code, drag handle
 * on the right), the bold title, the division as a grey subtitle with the brand, deadline and motion chips, then a
 * hairline and a footer with the requester and assignee avatars on the left and the request date on the right.
 * `interactive=false` is the drag overlay copy (no links, hidden from assistive tech by its wrapper).
 */
export function CardFace({ card, interactive = true, handle }: { card: RequestRow; interactive?: boolean; handle?: React.ReactNode }) {
  const open = card.status !== "DONE" && card.status !== "CANCELLED";
  const assignee = card.assigneeName ? `Assignee: ${card.assigneeName}` : "Assignee: Unassigned";
  const code = `REQ-${card.id.slice(-4).toUpperCase()}`;
  return (
    <>
      <div className="flex items-center justify-between gap-2 text-xs text-foreground-secondary">
        <span className="inline-flex min-w-0 items-center gap-1.5" title="Request code">
          <Link2 aria-hidden="true" strokeWidth={1.75} className="size-3.5 shrink-0" />
          <span className="font-medium tabular-nums">{code}</span>
        </span>
        {handle}
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-5 font-semibold break-words text-foreground">
        {interactive ? (
          <Link href={`/requests/${card.id}`} draggable={false} className={cn("rounded-sm underline-offset-2 hover:underline", focusRing)}>{card.title}</Link>
        ) : card.title}
      </p>
      <div data-card-chips="" className="mt-1.5 space-y-2">
        <p className="text-[13px] text-foreground-secondary">{card.divisionName}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <BrandTag name={card.brandName} />
          {open && <DeadlineChip daysLeft={card.daysLeft} />}
          {card.needsMotion && <NeedsMotionChip />}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
        <div className="flex min-w-0 items-center">
          <p className="inline-flex shrink-0" title={`Requester: ${card.requesterName}`}>
            <Avatar name={card.requesterName} size="sm" ring decorative />
            <span className="sr-only">Requester: {card.requesterName}</span>
          </p>
          <span className="-ml-1.5 inline-flex shrink-0" title={assignee} aria-label={assignee} role="img" data-card-assignee={card.assigneeName ? "assigned" : "unassigned"}>
            {card.assigneeName ? <Avatar name={card.assigneeName} size="sm" ring decorative /> : <UnassignedAvatar size="sm" ring decorative />}
          </span>
        </div>
        <time dateTime={card.requestedAt.toISOString()} className="shrink-0 text-xs tabular-nums text-foreground-secondary">{DATE_FORMAT.format(card.requestedAt)}</time>
      </div>
    </>
  );
}

/**
 * Board card. For movers the WHOLE card is the pointer/touch drag surface (listeners on the root; a 6px mouse
 * distance or a 250ms touch hold keeps the title link clickable and the page scrollable). The small handle button
 * remains the keyboard and screen-reader entry point (dnd-kit only starts a keyboard drag from the activator node,
 * so Enter on the title link still just follows the link); it is hidden until the card is hovered or focused (always shown on touch screens).
 * Read-only users get no listeners and no handle.
 */
export function BoardCard({ card, canMove, busy, dragging }: { card: RequestRow; canMove: boolean; busy: boolean; dragging: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id: card.id, disabled: !canMove || busy });
  return (
    <li ref={setNodeRef} data-card={card.id} data-draggable={canMove ? "true" : undefined} {...(canMove ? listeners : undefined)}
      className={cn(
        "group/card relative", CARD_SURFACE,
        "transition-[transform,border-color,box-shadow] duration-150 ease-out hover:-translate-y-px hover:border-border-strong motion-reduce:hover:translate-y-0",
        canMove && "cursor-grab touch-manipulation active:cursor-grabbing",
        dragging ? "opacity-40" : busy ? "opacity-60" : "",
      )}>
      <CardFace card={card}
        handle={canMove ? (
          <button type="button" ref={setActivatorNodeRef} {...attributes} aria-label={`Drag “${card.title}”`} disabled={busy}
            className={cn(
              "-mt-0.5 -mr-1 inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-foreground-secondary transition-opacity duration-150",
              "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-surface-muted",
              focusRing,
            )}>
            <GripVertical aria-hidden="true" strokeWidth={1.75} className="size-4" />
          </button>
        ) : undefined} />
    </li>
  );
}
