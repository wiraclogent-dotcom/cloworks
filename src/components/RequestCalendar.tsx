"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { rescheduleRequest } from "@/app/(app)/requests/actions";
import type { CalendarRow } from "@/lib/requests";
import { bucketByDay, buildMonthGrid } from "@/lib/calendar";
import { CALENDAR_DND_ID, CALENDAR_SR_INSTRUCTIONS, buildCalendarAnnouncements } from "@/lib/calendarA11y";
import { CALENDAR_CARD_OVERLAY, CalendarCardFace, cardTone } from "./CalendarCard";
import { CalendarAgenda } from "./calendar/CalendarAgenda";
import { DayCell } from "./calendar/DayCell";
import { DayDialog } from "./calendar/DayDialog";
import { createDayDrag } from "./calendar/dnd";
import { Alert } from "./ui/Alert";
import { Button, buttonClass } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { cn } from "./ui/cn";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NARROW_QUERY = "(max-width: 639px)";

/** Narrow-screen flag. The server snapshot is "wide", so hydration always renders the grid first. */
function subscribeNarrow(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const narrowNow = () => typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches;
const useNarrow = () => useSyncExternalStore(subscribeNarrow, narrowNow, () => false);

const monthName = (month: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00Z`));

export function RequestCalendar({ rows, month, today, canMove, prevHref, nextHref, todayHref }: {
  rows: CalendarRow[]; month: string; today: string; canMove: boolean; prevHref: string; nextHref: string; todayHref: string;
}) {
  const router = useRouter();
  const [seen, setSeen] = useState(rows);
  const [cards, setCards] = useState(rows);
  if (seen !== rows) { setSeen(rows); setCards(rows); }
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const narrow = useNarrow();

  const grid = useMemo(() => buildMonthGrid(month, today), [month, today]);
  const byDay = useMemo(() => bucketByDay(cards, today), [cards, today]);
  const activeCard = activeId ? cards.find((c) => c.id === activeId) ?? null : null;
  const dayOf = (c: CalendarRow) => c.deadlineDay ?? today;

  // Keyboard drag state shared by the coordinate getter and collision detection (day-by-day, skipping disabled days).
  const [drag] = useState(createDayDrag);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: drag.coordinateGetter }),
  );
  const announcements = useMemo(() => buildCalendarAnnouncements((id) => cards.find((c) => c.id === id)?.title), [cards]);

  // A moved card remounts in its new cell, so focus would fall to <body>: put it back on the card's handle (or link).
  const focusCardId = useRef<string | null>(null);
  useEffect(() => {
    const id = focusCardId.current;
    if (!id) return;
    const active = document.activeElement;
    if (active && active !== document.body && document.contains(active)) { focusCardId.current = null; return; }
    const el = document.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`);
    const target = el?.querySelector<HTMLElement>("button:not([disabled])") ?? el?.querySelector<HTMLElement>("a[href]");
    if (target) { target.focus(); focusCardId.current = null; }
  });

  async function submit(card: CalendarRow, to: string) {
    setMessage(null);
    setBusyId(card.id);
    focusCardId.current = card.id;
    // Optimistic: the card jumps to the FRONT of its new day so it is visible there (not hidden behind "+N more").
    const index = cards.findIndex((c) => c.id === card.id);
    setCards((cs) => [{ ...card, deadlineDay: to }, ...cs.filter((c) => c.id !== card.id)]);
    const undo = () => setCards((cs) => {
      const rest = cs.filter((c) => c.id !== card.id);
      rest.splice(Math.min(Math.max(index, 0), rest.length), 0, card);
      return rest;
    });
    try {
      const res = await rescheduleRequest(card.id, to);
      if (res.ok) router.refresh();
      else { undo(); setMessage(res.message); }
    } catch {
      undo();
      setMessage("Could not change the deadline. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  function onDragStart(e: DragStartEvent) {
    const card = cards.find((c) => c.id === e.active.id);
    if (!card) return;
    setActiveId(card.id);
    drag.start(dayOf(card), card.requestDay, e.activatorEvent instanceof KeyboardEvent);
  }
  function onDragEnd(e: DragEndEvent) {
    drag.stop();
    setActiveId(null);
    const card = cards.find((c) => c.id === e.active.id);
    const to = typeof e.over?.id === "string" ? e.over.id : null;
    // Same day: nothing to do. Before the request day: never a legal target (the cell is disabled; this is the guard).
    if (!card || !to || to === dayOf(card) || to < card.requestDay) return;
    void submit(card, to);
  }
  function onDragCancel() { drag.stop(); setActiveId(null); }

  const navLink = cn(buttonClass({ variant: "ghost", size: "sm" }), "px-2");
  return (
    <div data-page-wide="">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-heading">{monthName(month, { month: "long", year: "numeric" })}</h2>
        <nav aria-label="Month" className="ml-auto flex items-center gap-1">
          <Link href={prevHref} aria-label="Previous month" title="Previous month" className={navLink}><ChevronLeft aria-hidden="true" strokeWidth={1.75} className="size-4" /></Link>
          <Link href={nextHref} aria-label="Next month" title="Next month" className={navLink}><ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4" /></Link>
          <Link href={todayHref} className={buttonClass({ variant: "secondary", size: "sm" })}>Today</Link>
        </nav>
      </div>
      {message && (
        <Alert tone="danger" className="mb-3"
          action={<Button variant="ghost" size="sm" icon={<X aria-hidden="true" strokeWidth={1.75} />} onClick={() => setMessage(null)}>Dismiss</Button>}>
          <p>{message}</p>
        </Alert>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title={`Nothing due in ${monthName(month, { month: "long" })}`}
          description="Open requests with a deadline this month show up here."
          action={<Link href={todayHref} className={buttonClass({ variant: "secondary", size: "sm" })}>Today</Link>} />
      ) : narrow ? (
        <CalendarAgenda byDay={byDay} today={today} />
      ) : (
        <>
          {canMove
            ? <p className="mb-3 text-sm text-foreground-secondary">Drag a card to another day to change its deadline.</p>
            : <p className="mb-3 text-sm text-foreground-secondary">You can view the calendar. Only creative team members can change deadlines.</p>}
          <DndContext id={CALENDAR_DND_ID} sensors={sensors} collisionDetection={drag.collisionDetection}
            onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}
            accessibility={{ announcements, screenReaderInstructions: { draggable: CALENDAR_SR_INSTRUCTIONS } }}>
            <div aria-hidden="true" className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => <div key={w} data-weekday="" className="px-1 text-xs font-medium text-foreground-secondary">{w}</div>)}
            </div>
            <div className="space-y-1">
              {grid.weeks.map((week) => (
                <div key={week[0].day} className="grid grid-cols-7 gap-1">
                  {week.map((d) => (
                    <DayCell key={d.day} day={d} cards={byDay.get(d.day) ?? []} today={today} canMove={canMove}
                      activeMin={activeCard?.requestDay ?? null} activeId={activeId} busyId={busyId} onMore={setOpenDay} />
                  ))}
                </div>
              ))}
            </div>
            <DragOverlay>
              {activeCard ? (
                <div aria-hidden="true" data-drag-overlay="" data-tone={cardTone(activeCard, today)}
                  className={cn(CALENDAR_CARD_OVERLAY, "cursor-grabbing rotate-2 motion-reduce:rotate-0")}>
                  <CalendarCardFace card={activeCard} today={today} interactive={false} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      )}
      {openDay && !narrow && <DayDialog day={openDay} cards={byDay.get(openDay) ?? []} today={today} onClose={() => setOpenDay(null)} />}
    </div>
  );
}
