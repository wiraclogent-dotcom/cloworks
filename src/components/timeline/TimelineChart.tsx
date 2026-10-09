import { useId } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TimelineRow } from "@/lib/requests";
import { brandTone } from "@/lib/palette";
import type { TimelineBar, TimelineDay, TimelinePerson } from "@/lib/workload";
import { StatusIcon } from "../status";
import { cn, focusRing } from "../ui/cn";
import { barText } from "./barText";
import { PersonHeading } from "./PersonHeading";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Label column + 14 day columns; day columns never get narrower than 3.5rem (the card scrolls sideways instead). */
const ROW_GRID = "grid grid-cols-[12rem_minmax(0,1fr)]";
const DAY_GRID = "grid grid-cols-[repeat(14,minmax(3.5rem,1fr))]";

/** Weekend shading and today's outline behind the bars. */
function DayUnderlay({ days }: { days: TimelineDay[] }) {
  return (
    <div aria-hidden="true" className={cn(DAY_GRID, "pointer-events-none absolute inset-0")}>
      {days.map((d) => (
        <div key={d.day} className={cn("border-l border-border first:border-l-0", d.isWeekend && "bg-surface-muted", d.isToday && "border-x-2 border-ring")} />
      ))}
    </div>
  );
}

function Bar({ bar, row, lane }: { bar: TimelineBar; row: TimelineRow; lane: number }) {
  const text = barText(row, bar);
  const span = bar.endCol - bar.startCol + 1;
  const tailPct = bar.overdue ? (bar.planEndCol === null ? 100 : ((bar.endCol - bar.planEndCol) / span) * 100) : 0;
  return (
    <li className="min-w-0" style={{ gridColumn: `${bar.startCol + 1} / ${bar.endCol + 2}`, gridRow: lane + 1 }}>
      <Link href={`/requests/${row.id}`} title={text} data-bar={row.id} data-lane={lane} data-tone={brandTone(row.brandName)}
        data-no-deadline={bar.noDeadline ? "" : undefined}
        className={cn(
          "relative mx-0.5 flex h-7 items-center gap-1 overflow-hidden rounded-md border border-l-4 border-border border-l-tone-accent bg-card px-1.5 text-xs text-card-foreground shadow-card",
          "transition-[border-color] duration-150 hover:border-border-strong",
          bar.noDeadline && "border-dashed border-border-strong",
          focusRing,
        )}>
        <span className="sr-only">{text}</span>
        {bar.clippedStart && <ChevronLeft data-clipped="start" aria-hidden="true" strokeWidth={2} className="-ml-1 size-3.5 shrink-0 text-foreground-secondary" />}
        <span aria-hidden="true" className="inline-flex shrink-0 text-foreground-secondary"><StatusIcon status={row.status} /></span>
        <span aria-hidden="true" className="min-w-0 flex-1 truncate font-medium text-foreground">{row.title}</span>
        {bar.noDeadline && <span aria-hidden="true" className="shrink-0 text-foreground-secondary">No deadline</span>}
        {tailPct > 0 && (
          <span data-overdue-tail="" data-tone="overdue" aria-hidden="true"
            className="absolute inset-y-0 right-0 flex items-center justify-end bg-tone-tint px-1.5 font-medium text-tone-text"
            style={{ width: `${tailPct}%` }}>
            <span className="truncate">Overdue</span>
          </span>
        )}
        {bar.clippedEnd && <ChevronRight data-clipped="end" aria-hidden="true" strokeWidth={2} className="relative -mr-1 size-3.5 shrink-0 text-foreground-secondary" />}
      </Link>
    </li>
  );
}

function PersonRow({ person, days, rows }: { person: TimelinePerson; days: TimelineDay[]; rows: Map<string, TimelineRow> }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn(ROW_GRID, "border-t border-border")}>
      <div className="border-r border-border px-3 py-2"><PersonHeading person={person} headingId={headingId} /></div>
      <div className="relative">
        <DayUnderlay days={days} />
        {person.lanes.length > 0 ? (
          <ul className={cn(DAY_GRID, "relative auto-rows-[1.75rem] gap-y-1 py-2")}>
            {person.lanes.flatMap((lane, i) => lane.map((b) => {
              const row = rows.get(b.id);
              return row ? <Bar key={b.id} bar={b} row={row} lane={i} /> : null;
            }))}
          </ul>
        ) : <p className="sr-only">No open requests</p>}
      </div>
    </section>
  );
}

/** Wide screens: label column + 14 day columns in a sideways-scrolling card. Each person is a section with a list of links. */
export function TimelineChart({ days, persons, rows }: { days: TimelineDay[]; persons: TimelinePerson[]; rows: Map<string, TimelineRow> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
      <div className="min-w-[61rem]">
        <div className={cn(ROW_GRID, "bg-surface-muted text-xs font-medium text-foreground-secondary")}>
          <div className="border-r border-border px-3 py-2">Person</div>
          <div className={DAY_GRID}>
            {days.map((d) => (
              <div key={d.day} data-day={d.day} data-weekend={d.isWeekend ? "" : undefined} aria-current={d.isToday ? "date" : undefined}
                className={cn("border-l border-border px-1.5 py-2 whitespace-nowrap tabular-nums first:border-l-0", d.isToday && "font-semibold text-link")}>
                {`${WEEKDAYS[d.weekday]} ${Number(d.day.slice(8))}`}
              </div>
            ))}
          </div>
        </div>
        {persons.map((p) => <PersonRow key={p.key} person={p} days={days} rows={rows} />)}
      </div>
    </div>
  );
}
