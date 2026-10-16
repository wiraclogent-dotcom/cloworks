"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import Link from "next/link";
import type { RequestStatus } from "@prisma/client";
import { moveRequest } from "@/app/(app)/requests/actions";
import type { BoardColumn, RequestRow } from "@/lib/requests";
import { BOARD_PAGE_SIZE } from "@/lib/paging";
import { canTransition } from "@/lib/workflow";
import { decideDrop } from "@/lib/boardDrop";
import { BOARD_DND_ID, SCREEN_READER_INSTRUCTIONS, buildAnnouncements } from "@/lib/boardA11y";
import { REQUEST_STATUS_TONE } from "@/lib/palette";
import { ArrowDownToLine, Ban, ChevronDown, Inbox, Table2, X } from "lucide-react";
import { BoardCard, CARD_GLASS, CARD_OVERLAY, CardFace, GLASS_LOOK } from "./BoardCard";
import { LiquidGlassCard } from "./ui/LiquidGlassCard";
import { useBoardBackground } from "./board/BoardBackgroundProvider";
import { PLAIN_BOARD, boardInk, veilColor, type BoardBackground } from "@/lib/boardBackground";
import { DoneDialog, type DoneDetails } from "./DoneDialog";
import { STATUS_LABEL, StatusIcon } from "./status";
import { Alert, AlertAction, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { cn, focusRing } from "./ui/cn";

/** Arrow Left/Right jumps the lifted card to the neighbouring column instead of nudging it 25px. */
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context: { droppableRects, droppableContainers, collisionRect } }) => {
  const dir = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (!dir || !collisionRect) return undefined;
  event.preventDefault();
  const cols = droppableContainers.getEnabled()
    .map((c) => droppableRects.get(c.id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => a.left - b.left);
  const centerX = collisionRect.left + collisionRect.width / 2;
  const idx = cols.findIndex((r) => centerX >= r.left && centerX <= r.left + r.width);
  const target = cols[idx + dir];
  return target ? { x: target.left + 8, y: collisionRect.top } : undefined;
};

/** A column as the server hands it over: total, the loaded rows, and no-JS links built from the current filters. */
export type BoardColumnView = BoardColumn & { moreHref: string | null; tableHref: string };
type Totals = Partial<Record<RequestStatus, number>>;

/** Quiet text-link look for the column footer (Show more / Open all in table). */
const FOOTER_LINK = cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-link hover:bg-card hover:underline underline-offset-2", focusRing);

function Column({ status, total, shown, dragFrom, moreHref, tableHref, glass, children }: {
  status: RequestStatus; total: number; shown: number; dragFrom: RequestStatus | null; moreHref: string | null; tableHref: string; glass: boolean; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const id = `col-${status}`;
  const dragging = dragFrom !== null && dragFrom !== status;
  const legal = dragging && canTransition(dragFrom, status);
  const remaining = total - shown;
  return (
    <section ref={setNodeRef} role="region" aria-labelledby={id} data-tone={REQUEST_STATUS_TONE[status]}
      data-drop={legal ? (isOver ? "over" : "valid") : dragging ? "invalid" : undefined}
      className={cn(
        "board-column flex min-w-0 flex-col rounded-2xl p-2 outline-2 -outline-offset-2 transition-[outline-color,opacity,background-color] duration-150",
        legal && isOver ? "bg-accent" : glass ? "bg-glass-column" : "bg-muted",
        legal ? (isOver ? "outline-ring outline-solid" : "outline-ring outline-dashed") : "outline-transparent",
        dragging && !legal && "opacity-60",
      )}>
      <h2 id={id} data-column-header=""
        className="mb-2 flex flex-none items-center gap-2 px-2 py-1.5 text-sm font-semibold text-foreground [&_svg]:text-tone-accent">
        <StatusIcon status={status} />
        {STATUS_LABEL[status]}
        <span className="ml-auto inline-flex min-w-6 items-center justify-center rounded-full bg-card px-2 py-0.5 text-xs leading-4 font-semibold text-foreground tabular-nums">{total}</span>
      </h2>
      {dragging && (
        <p className="mb-2 flex flex-none items-center gap-1.5 px-1 text-xs font-medium text-foreground">
          {legal ? <><ArrowDownToLine aria-hidden="true" strokeWidth={1.75} className="size-3.5" />{`Drop to move to ${STATUS_LABEL[status]}`}</> : <><Ban aria-hidden="true" strokeWidth={1.75} className="size-3.5" />Not a valid move</>}
        </p>
      )}
      <div data-column-body className="relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-1">
        {children}
      </div>
      {total > 0 && (
        <div className="mt-1 flex-none border-t border-border px-1 pt-2 text-xs text-muted-foreground">
          <p className="tabular-nums">Showing {shown} of {total}</p>
          {remaining > 0 && (
            <p className="mt-1 -ml-1.5 flex flex-wrap gap-x-1 gap-y-1">
              {moreHref && <Link href={moreHref} scroll={false} className={FOOTER_LINK}><ChevronDown aria-hidden="true" strokeWidth={1.75} className="size-3.5" />Show {Math.min(BOARD_PAGE_SIZE, remaining)} more</Link>}
              <Link href={tableHref} className={FOOTER_LINK}><Table2 aria-hidden="true" strokeWidth={1.75} className="size-3.5" />Open all in table</Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * `background` is what the board sits on (src/lib/boardBackground): "plain" keeps the page canvas and muted columns; a
 * picture turns the cards to glass under the person's veil. Inside a BoardBackgroundProvider the picker's live state
 * wins, so changes show while they are being made.
 */
export function Board({ columns, canMove, background = PLAIN_BOARD }: { columns: BoardColumnView[]; canMove: boolean; background?: BoardBackground }) {
  const bg = useBoardBackground()?.background ?? background;
  const glass = bg.id !== "plain" && !!bg.src;
  const router = useRouter();
  const initialCards = useMemo(() => columns.flatMap((c) => c.rows), [columns]);
  const initialTotals = useMemo(() => Object.fromEntries(columns.map((c) => [c.status, c.total])) as Totals, [columns]);
  const [seen, setSeen] = useState(columns);
  const [cards, setCards] = useState(initialCards);
  const [totals, setTotals] = useState(initialTotals);
  if (seen !== columns) { setSeen(columns); setCards(initialCards); setTotals(initialTotals); }
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDone, setPendingDone] = useState<RequestRow | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeCard = activeId ? cards.find((c) => c.id === activeId) ?? null : null;

  // Focus bookkeeping: a moved card remounts in its new column, so focus would fall to <body>.
  const focusCardId = useRef<string | null>(null);
  useEffect(() => {
    const id = focusCardId.current;
    if (!id || pendingDone) return;
    const active = document.activeElement;
    if (active && active !== document.body && document.contains(active)) { focusCardId.current = null; return; }
    // Prefer the drag handle (so the keyboard user can lift the card again), else the title link.
    const el = document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
    const target = el?.querySelector<HTMLElement>("button:not([disabled])") ?? el?.querySelector<HTMLElement>("a[href]");
    if (target) { target.focus(); focusCardId.current = null; }
  });

  const announcements = useMemo(() => buildAnnouncements((id) => cards.find((c) => c.id === id)?.title), [cards]);

  // Mouse (6px distance, so the title link stays clickable) + touch (press-and-hold, so the page still scrolls) + keyboard.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  /** Optimistic move: the card goes to the TOP of the destination (even beyond its loaded rows) and both totals shift. Returns the undo. */
  function applyMove(card: RequestRow, to: RequestStatus): () => void {
    const from = card.status;
    const index = cards.findIndex((c) => c.id === card.id);
    setCards((cs) => [{ ...card, status: to }, ...cs.filter((c) => c.id !== card.id)]);
    setTotals((t) => ({ ...t, [from]: Math.max(0, (t[from] ?? 0) - 1), [to]: (t[to] ?? 0) + 1 }));
    return () => {
      setCards((cs) => {
        const rest = cs.filter((c) => c.id !== card.id);
        rest.splice(Math.min(Math.max(index, 0), rest.length), 0, card);
        return rest;
      });
      setTotals((t) => ({ ...t, [from]: (t[from] ?? 0) + 1, [to]: Math.max(0, (t[to] ?? 0) - 1) }));
    };
  }

  async function submit(card: RequestRow, to: RequestStatus, opts?: DoneDetails) {
    setMessage(null);
    setBusyId(card.id);
    // An illegal move is not applied locally; the server answers with a human-readable message.
    const undo = canTransition(card.status, to) ? applyMove(card, to) : () => {};
    try {
      const res = await moveRequest(card.id, to, opts);
      if (res.ok) router.refresh();
      else { undo(); setMessage(res.message); }
    } catch {
      undo();
      setMessage("Could not move the request. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  /** The single code path for every drop (pointer, touch, keyboard): decideDrop picks the outcome. */
  function requestMove(card: RequestRow, to: RequestStatus) {
    const decision = decideDrop({ from: card.status, to, hasAssignee: card.assignees.length > 0, canMove });
    if (decision.kind === "noop") return;
    focusCardId.current = card.id;
    switch (decision.kind) {
      case "needs-assignee": setMessage("Assign someone before marking this request Done."); return;
      case "needs-done-details": setPendingDone(card); return;
      case "illegal":
      case "move": void submit(card, to); return;
    }
  }

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const card = cards.find((c) => c.id === e.active.id);
    const to = columns.find((c) => c.status === e.over?.id)?.status;
    if (card && to) requestMove(card, to);
  }

  return (
    <div>
      {message && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription><p>{message}</p></AlertDescription>
          <AlertAction><Button variant="ghost" size="sm" icon={<X aria-hidden="true" strokeWidth={1.75} />} onClick={() => setMessage(null)}>Dismiss</Button></AlertAction>
        </Alert>
      )}
      {!canMove && <p className="mb-3 text-sm text-muted-foreground">You can view the board. Only creative team members can move requests.</p>}
      <DndContext id={BOARD_DND_ID} sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}
        accessibility={{ announcements, screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS } }}>
        {/* The background wraps the drag overlay too, so the lifted card keeps the board's ink tokens. */}
        <div data-board-background={bg.id} data-board-ink={glass ? boardInk(bg.veil) : undefined}
          className={cn(glass && cn("rounded-3xl p-3 board-picture", boardInk(bg.veil) === "dark" ? "board-ink-dark" : "board-ink-light"))}
          style={glass ? ({ "--board-image": `url(${JSON.stringify(bg.src)})`, "--board-veil": veilColor(bg.veil) } as React.CSSProperties) : undefined}>
        <div className="relative grid gap-3 overflow-x-auto pb-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(15rem, 1fr))` }}>
          {columns.map((col) => {
            const inCol = cards.filter((c) => c.status === col.status);
            return (
              <Column key={col.status} status={col.status} total={totals[col.status] ?? 0} shown={inCol.length}
                dragFrom={activeCard?.status ?? null} moreHref={col.moreHref} tableHref={col.tableHref} glass={glass}>
                {inCol.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border-strong px-3 py-6 text-center text-compact text-muted-foreground">
                    <Inbox aria-hidden="true" strokeWidth={1.75} className="size-5" />
                    <p>No requests here</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {inCol.map((c) => <BoardCard key={c.id} card={c} canMove={canMove} busy={busyId === c.id} dragging={activeId === c.id} glass={glass} />)}
                  </ul>
                )}
              </Column>
            );
          })}
        </div>
        {/* Rendered in a portal-like fixed layer so the dragged card is never clipped by the scrolling columns. */}
        <DragOverlay>
          {activeCard ? (
            glass ? (
              <LiquidGlassCard aria-hidden="true" data-drag-overlay="" {...GLASS_LOOK} className={cn(CARD_GLASS, "cursor-grabbing rotate-3 motion-reduce:rotate-0")}>
                <CardFace card={activeCard} interactive={false} />
              </LiquidGlassCard>
            ) : (
              <div aria-hidden="true" data-drag-overlay="" className={cn(CARD_OVERLAY, "cursor-grabbing rotate-3 motion-reduce:rotate-0")}>
                <CardFace card={activeCard} interactive={false} />
              </div>
            )
          ) : null}
        </DragOverlay>
        </div>
      </DndContext>
      {pendingDone && (
        <DoneDialog title={pendingDone.title} onCancel={() => setPendingDone(null)}
          onSubmit={(d) => { const c = pendingDone; setPendingDone(null); void submit(c, "DONE", d); }} />
      )}
    </div>
  );
}
