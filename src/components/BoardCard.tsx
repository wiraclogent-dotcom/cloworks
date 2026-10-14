"use client";

import { useDraggable } from "@dnd-kit/core";
import type { RequestRow } from "@/lib/requests";
import Link from "next/link";
import { GripVertical, Link2 } from "lucide-react";
import { BrandTag } from "./ui/Chip";
import { DeadlineChip } from "./ui/DeadlineChip";
import { NeedsMotionChip } from "./ui/NeedsMotionChip";
import { assigneeLabel } from "@/lib/assignees";
import { Avatar, AvatarStack, UnassignedAvatar } from "./ui/Avatar";
import { SharedChip } from "./ui/SharedChip";
import { cn, focusRing } from "./ui/cn";

const CARD_SHAPE = "rounded-xl border bg-card p-4 text-sm text-card-foreground";
/** Card in its column: white, 12px radius, a whisper of a hairline and a soft shadow that deepens on hover (no movement, so drags stay put). */
export const CARD_SURFACE = `${CARD_SHAPE} border-border/70 shadow-card transition-[box-shadow,border-color] duration-200 hover:border-border-strong hover:shadow-raised`;
/** The drag overlay copy: same card, Aqua outline and the raised shadow. */
export const CARD_OVERLAY = `${CARD_SHAPE} border-ring shadow-raised`;

/** Edge mark for a shared request (the card root has `data-shared`): a 3px Aqua bar inside the left edge. `--accent` is too pale for this; `--ring` exists in light and dark. */
export const SHARED_ACCENT = "before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-full before:bg-ring";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric" });

/**
 * The card's visible content, laid out like the reference: a code row (link icon + short request code, drag handle
 * on the right), the bold title, the division as a grey subtitle with the brand, deadline and motion chips, then a
 * hairline and a footer with the requester and assignee avatars on the left and the request date on the right.
 * `interactive=false` is the drag overlay copy (no links, hidden from assistive tech by its wrapper).
 */
export function CardFace({ card, interactive = true, handle }: { card: RequestRow; interactive?: boolean; handle?: React.ReactNode }) {
  const open = card.status !== "DONE" && card.status !== "CANCELLED";
  const names = card.assignees.map((a) => a.name);
  const shared = names.length >= 2;
  const assigneeName = names[0] ?? null;
  const assignee = assigneeName ? `Assignee: ${assigneeName}` : "Assignee: Unassigned";
  const code = `REQ-${card.id.slice(-4).toUpperCase()}`;
  return (
    <>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap" title="Request code">
          <Link2 aria-hidden="true" strokeWidth={1.75} className="size-3.5 shrink-0" />
          <span className="font-medium tabular-nums">{code}</span>
        </span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1">
          <time dateTime={card.requestedAt.toISOString()} className="tabular-nums">{DATE_FORMAT.format(card.requestedAt)}</time>
          {handle}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm leading-5 font-semibold break-words text-foreground">
        {interactive ? (
          <Link href={`/requests/${card.id}`} draggable={false} className={cn("rounded-sm underline-offset-2 hover:underline", focusRing)}>{card.title}</Link>
        ) : card.title}
      </p>
      <div data-card-chips="" className="mt-1.5 space-y-2">
        <p className="text-[13px] text-muted-foreground">{card.divisionName}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <BrandTag name={card.brandName} />
          {open && <DeadlineChip daysLeft={card.daysLeft} />}
          {(card.needsMotion || card.isVideo) && <NeedsMotionChip video={card.isVideo} />}
          {shared && <SharedChip />}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs">
        {/* The requester keeps its natural width (up to half); the assignee side is the one that truncates. */}
        <p className="inline-flex max-w-1/2 shrink-0 items-center gap-1.5" title={`Requester: ${card.requesterName}`}>
          <Avatar name={card.requesterName} size="sm" decorative />
          <span className="min-w-0 truncate text-muted-foreground">{card.requesterName}</span>
          <span className="sr-only">Requester: {card.requesterName}</span>
        </p>
        {shared ? (
          <span className="inline-flex min-w-0 items-center gap-1.5" title={`Assignees: ${names.join(", ")}`} data-card-assignee="shared">
            <span aria-hidden="true" className="min-w-0 truncate text-muted-foreground">{assigneeLabel(names)}</span>
            <AvatarStack names={names} max={3} size="sm" label="Assignees" />
          </span>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1.5" title={assignee} aria-label={assignee} role="img" data-card-assignee={assigneeName ? "assigned" : "unassigned"}>
            <span className="truncate text-muted-foreground">{assigneeName ?? "Unassigned"}</span>
            {assigneeName ? <Avatar name={assigneeName} size="sm" decorative /> : <UnassignedAvatar size="sm" decorative />}
          </span>
        )}
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
  const shared = card.assignees.length >= 2;
  return (
    <li ref={setNodeRef} data-card={card.id} data-shared={shared ? "" : undefined} data-draggable={canMove ? "true" : undefined} {...(canMove ? listeners : undefined)}
      className={cn(
        "group/card relative", CARD_SURFACE, shared && SHARED_ACCENT,
        "transition-[transform,border-color,box-shadow] duration-150 ease-out hover:-translate-y-px hover:border-border-strong motion-reduce:hover:translate-y-0",
        canMove && "cursor-grab touch-manipulation active:cursor-grabbing",
        dragging ? "opacity-40" : busy ? "opacity-60" : "",
      )}>
      <CardFace card={card}
        handle={canMove ? (
          <button type="button" ref={setActivatorNodeRef} {...attributes} aria-label={`Drag “${card.title}”`} disabled={busy}
            className={cn(
              "-mt-0.5 -mr-1 inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-opacity duration-150",
              "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-muted",
              focusRing,
            )}>
            <GripVertical aria-hidden="true" strokeWidth={1.75} className="size-4" />
          </button>
        ) : undefined} />
    </li>
  );
}
