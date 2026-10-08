"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core";
import type { RequestStatus } from "@prisma/client";
import { moveRequest } from "@/app/(app)/requests/actions";
import type { RequestRow } from "@/lib/requests";
import { canTransition } from "@/lib/workflow";
import { BOARD_DND_ID, SCREEN_READER_INSTRUCTIONS, buildAnnouncements } from "@/lib/boardA11y";
import { BoardCard } from "./BoardCard";
import { DoneDialog, type DoneDetails } from "./DoneDialog";
import { BOARD_STATUSES, STATUS_LABEL, StatusIcon } from "./status";

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

function Column({ status, count, children }: { status: RequestStatus; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const id = `col-${status}`;
  return (
    <section ref={setNodeRef} role="region" aria-labelledby={id}
      className={`flex min-w-0 flex-col rounded-lg border bg-muted p-3 ${isOver ? "border-ring" : "border-border"}`}>
      <h2 id={id} className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <StatusIcon status={status} />
        {STATUS_LABEL[status]}
        <span className="ml-auto rounded-full bg-background px-2 text-xs font-normal">{count}</span>
      </h2>
      {children}
    </section>
  );
}

export function Board({ requests, canMove, showCancelled = false }: { requests: RequestRow[]; canMove: boolean; showCancelled?: boolean }) {
  const router = useRouter();
  const [seen, setSeen] = useState(requests);
  const [cards, setCards] = useState(requests);
  if (seen !== requests) { setSeen(requests); setCards(requests); }
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDone, setPendingDone] = useState<RequestRow | null>(null);

  // Focus bookkeeping: a moved card remounts in its new column, so focus would fall to <body>.
  const focusCardId = useRef<string | null>(null);
  useEffect(() => {
    const id = focusCardId.current;
    if (!id || pendingDone) return;
    const active = document.activeElement;
    if (active && active !== document.body && document.contains(active)) { focusCardId.current = null; return; }
    const target = document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)
      ?.querySelector<HTMLElement>("button:not([disabled]), select:not([disabled]), a[href]");
    if (target) { target.focus(); focusCardId.current = null; }
  });

  const announcements = useMemo(() => buildAnnouncements((id) => cards.find((c) => c.id === id)?.title), [cards]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  const setStatus = (id: string, status: RequestStatus) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));

  async function submit(card: RequestRow, to: RequestStatus, opts?: DoneDetails) {
    const from = card.status;
    const legal = canTransition(from, to);
    setMessage(null);
    setBusyId(card.id);
    if (legal) setStatus(card.id, to);
    try {
      const res = await moveRequest(card.id, to, opts);
      if (res.ok) router.refresh();
      else { setStatus(card.id, from); setMessage(res.message); }
    } catch {
      setStatus(card.id, from);
      setMessage("Could not move the request. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  function requestMove(card: RequestRow, to: RequestStatus) {
    if (to === card.status) return;
    focusCardId.current = card.id;
    if (to === "DONE" && canTransition(card.status, "DONE") && !card.assigneeName) {
      setMessage("Assign someone before marking this request Done.");
      return;
    }
    // Legal DONE needs delivery details first; an illegal one goes to the server so the user sees its message.
    if (to === "DONE" && canTransition(card.status, "DONE")) setPendingDone(card);
    else void submit(card, to);
  }

  function onDragEnd(e: DragEndEvent) {
    const card = cards.find((c) => c.id === e.active.id);
    if (card && e.over) requestMove(card, e.over.id as RequestStatus);
  }

  const columns = showCancelled ? [...BOARD_STATUSES, "CANCELLED" as RequestStatus] : BOARD_STATUSES;
  const visible = cards.filter((c) => columns.includes(c.status));

  return (
    <div>
      {message && (
        <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-md border border-border bg-card p-3 text-sm">
          <p><span aria-hidden="true">⚠ </span>{message}</p>
          <button type="button" onClick={() => setMessage(null)} className="underline focus-visible:outline-2 focus-visible:outline-ring">Dismiss</button>
        </div>
      )}
      {!canMove && <p className="mb-3 text-sm text-muted-foreground">You can view the board. Only creative team members can move requests.</p>}
      <DndContext id={BOARD_DND_ID} sensors={sensors} onDragEnd={onDragEnd}
        accessibility={{ announcements, screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS } }}>
        <div className="grid gap-4 overflow-x-auto pb-4" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(13rem, 1fr))` }}>
          {columns.map((status) => {
            const inCol = visible.filter((c) => c.status === status);
            return (
              <Column key={status} status={status} count={inCol.length}>
                {inCol.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nothing here yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {inCol.map((c) => <BoardCard key={c.id} card={c} canMove={canMove} busy={busyId === c.id} onMove={requestMove} />)}
                  </ul>
                )}
              </Column>
            );
          })}
        </div>
      </DndContext>
      {pendingDone && (
        <DoneDialog title={pendingDone.title} onCancel={() => setPendingDone(null)}
          onSubmit={(d) => { const c = pendingDone; setPendingDone(null); void submit(c, "DONE", d); }} />
      )}
    </div>
  );
}
