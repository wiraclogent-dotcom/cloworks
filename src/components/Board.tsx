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
import { BoardCard, CardFace } from "./BoardCard";
import { DoneDialog, type DoneDetails } from "./DoneDialog";
import { STATUS_LABEL, StatusIcon } from "./status";

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

function Column({ status, total, shown, dragFrom, moreHref, tableHref, children }: {
  status: RequestStatus; total: number; shown: number; dragFrom: RequestStatus | null; moreHref: string | null; tableHref: string; children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const id = `col-${status}`;
  const dragging = dragFrom !== null && dragFrom !== status;
  const legal = dragging && canTransition(dragFrom, status);
  const border = legal ? (isOver ? "border-solid border-ring bg-background" : "border-dashed border-ring") : "border-border";
  const remaining = total - shown;
  return (
    <section ref={setNodeRef} role="region" aria-labelledby={id}
      className={`board-column flex min-w-0 flex-col rounded-lg border-2 bg-muted p-3 ${border} ${dragging && !legal ? "opacity-60" : ""}`}>
      <h2 id={id} className="mb-3 flex flex-none items-center gap-2 text-sm font-semibold">
        <StatusIcon status={status} />
        {STATUS_LABEL[status]}
        <span className="ml-auto rounded-full bg-background px-2 text-xs font-normal">{total}</span>
      </h2>
      {dragging && (
        <p className="mb-2 flex-none text-xs font-medium">
          {legal ? `Drop to move to ${STATUS_LABEL[status]}` : "Not a valid move"}
        </p>
      )}
      <div data-column-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
      {total > 0 && (
        <div className="mt-2 flex-none border-t border-border pt-2 text-xs">
          <p>Showing {shown} of {total}</p>
          {remaining > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {moreHref && <Link href={moreHref} scroll={false} className="underline focus-visible:outline-2 focus-visible:outline-ring">Show {Math.min(BOARD_PAGE_SIZE, remaining)} more</Link>}
              <Link href={tableHref} className="underline focus-visible:outline-2 focus-visible:outline-ring">Open all in table</Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function Board({ columns, canMove }: { columns: BoardColumnView[]; canMove: boolean }) {
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
    const target = document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)
      ?.querySelector<HTMLElement>("button:not([disabled]), a[href]");
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
    const decision = decideDrop({ from: card.status, to, hasAssignee: !!card.assigneeName, canMove });
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
        <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-md border border-border bg-card p-3 text-sm">
          <p><span aria-hidden="true">⚠ </span>{message}</p>
          <button type="button" onClick={() => setMessage(null)} className="underline focus-visible:outline-2 focus-visible:outline-ring">Dismiss</button>
        </div>
      )}
      {!canMove && <p className="mb-3 text-sm text-muted-foreground">You can view the board. Only creative team members can move requests.</p>}
      <DndContext id={BOARD_DND_ID} sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}
        accessibility={{ announcements, screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS } }}>
        <div className="grid gap-4 overflow-x-auto pb-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(13rem, 1fr))` }}>
          {columns.map((col) => {
            const inCol = cards.filter((c) => c.status === col.status);
            return (
              <Column key={col.status} status={col.status} total={totals[col.status] ?? 0} shown={inCol.length}
                dragFrom={activeCard?.status ?? null} moreHref={col.moreHref} tableHref={col.tableHref}>
                {inCol.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nothing here yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {inCol.map((c) => <BoardCard key={c.id} card={c} canMove={canMove} busy={busyId === c.id} dragging={activeId === c.id} />)}
                  </ul>
                )}
              </Column>
            );
          })}
        </div>
        {/* Rendered in a portal-like fixed layer so the dragged card is never clipped by the scrolling columns. */}
        <DragOverlay>
          {activeCard ? (
            <div aria-hidden="true" className="cursor-grabbing rounded-md border border-ring bg-card p-3 text-sm text-card-foreground shadow-lg">
              <CardFace card={activeCard} interactive={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {pendingDone && (
        <DoneDialog title={pendingDone.title} onCancel={() => setPendingDone(null)}
          onSubmit={(d) => { const c = pendingDone; setPendingDone(null); void submit(c, "DONE", d); }} />
      )}
    </div>
  );
}
