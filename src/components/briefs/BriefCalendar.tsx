"use client";

import { useState } from "react";
import type { BriefDay, BriefMonth, BriefPerson, DotState } from "@/lib/briefCalendar";
import { dayLabel } from "@/lib/calendar";
import { avatarColor } from "@/lib/palette";
import { useNarrow } from "../useNarrow";
import { cn, focusRing } from "../ui/cn";
import { BriefDayDialog } from "./BriefDayDialog";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const dayAria = (d: BriefDay, people: BriefPerson[]) =>
  `${dayLabel(d.day)}: ${people.map((p, i) => `${p.name} ${d.perPerson[i].count}`).join(", ")}`;

/** One person's mark: filled in their colour when they briefed (count shown above 1), hollow when a weekday was missed. */
function Dot({ person, count, state }: { person: BriefPerson; count: number; state: DotState }) {
  if (state === "none") return null;
  const c = avatarColor(person.name);
  return (
    <span aria-hidden="true" data-state={state} data-person={person.id}
      style={state === "sent" ? { backgroundColor: c.tint, color: c.text, borderColor: c.text } : undefined}
      className={cn(
        "inline-flex size-5 items-center justify-center rounded-full border-2 text-[11px] leading-none font-semibold tabular-nums",
        state === "missed" && "border-foreground-muted bg-transparent",
      )}>
      {state === "sent" && count > 1 ? count : null}
    </span>
  );
}

function Dots({ day, people }: { day: BriefDay; people: BriefPerson[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {people.map((p, i) => <Dot key={p.id} person={p} count={day.perPerson[i].count} state={day.perPerson[i].state} />)}
    </span>
  );
}

/**
 * Brief calendar (spec 2026-10-10): legend, one summary tile per person, then a Monday-first month grid (a day list on
 * narrow screens). Every in-month day is a button that opens that day's requests.
 */
export function BriefCalendar({ people, model }: { people: BriefPerson[]; model: BriefMonth }) {
  const narrow = useNarrow();
  const [open, setOpen] = useState<string | null>(null);
  const days = model.weeks.flat().filter((d) => d.inMonth);

  return (
    <div className="space-y-5">
      <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground-secondary">
        {people.map((p) => {
          const c = avatarColor(p.name);
          return (
            <li key={p.id} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-3 rounded-full border-2" style={{ backgroundColor: c.tint, borderColor: c.text }} />
              {p.name}
            </li>
          );
        })}
      </ul>
      <p className="-mt-3 flex items-center gap-1.5 text-xs text-foreground-secondary">
        <span aria-hidden="true" className="size-3 shrink-0 rounded-full border-2 border-foreground-muted" />
        Hollow circle: no brief that weekday. Weekends are never counted as missed.
      </p>

      <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card sm:grid-cols-3">
        {people.map((p, i) => {
          const s = model.summary[i];
          return (
            <li key={p.id} aria-label={`${p.name} summary`} className="flex min-w-0 flex-col gap-1 bg-card p-4">
              <span className="text-[13px] text-foreground-secondary">{p.name}</span>
              <span className="text-2xl leading-8 font-semibold text-foreground tabular-nums">
                {s.weekdaysElapsed === 0 ? "—" : `${s.weekdaysBriefed} / ${s.weekdaysElapsed} weekdays`}
              </span>
              <span className="text-xs text-foreground-secondary tabular-nums">{s.briefs === 1 ? "1 brief" : `${s.briefs} briefs`}</span>
            </li>
          );
        })}
      </ul>

      {narrow ? (
        <ol aria-label="Days" className="divide-y divide-border rounded-xl border border-border bg-surface">
          {days.map((d) => (
            <li key={d.day} aria-current={d.isToday ? "date" : undefined}>
              <button type="button" aria-haspopup="dialog" aria-label={dayAria(d, people)} onClick={() => setOpen(d.day)}
                className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm", (d.isWeekend || d.isFuture) && "text-foreground-secondary", d.isWeekend && "bg-surface-muted", focusRing)}>
                <span>{dayLabel(d.day)}{d.isToday && <span className="ml-1.5 font-medium text-link">Today</span>}</span>
                <Dots day={d} people={people} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <div>
          <div aria-hidden="true" className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => <div key={w} data-weekday="" className="px-1 text-xs font-medium text-foreground-secondary">{w}</div>)}
          </div>
          <div className="space-y-1">
            {model.weeks.map((week) => (
              <div key={week[0].day} className="grid grid-cols-7 gap-1">
                {week.map((d) => d.inMonth ? (
                  <button key={d.day} type="button" aria-haspopup="dialog" aria-label={dayAria(d, people)} aria-current={d.isToday ? "date" : undefined}
                    onClick={() => setOpen(d.day)}
                    className={cn(
                      "flex min-h-20 min-w-0 flex-col items-start gap-1.5 rounded-lg border p-1.5 text-left hover:bg-accent",
                      d.isWeekend ? "bg-surface-muted" : "bg-surface",
                      d.isToday ? "border-ring" : "border-border",
                      d.isFuture && "opacity-60",
                      focusRing,
                    )}>
                    <span aria-hidden="true" className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      d.isToday ? "bg-accent font-semibold text-accent-foreground" : d.isWeekend ? "text-foreground-secondary" : "text-foreground",
                    )}>{Number(d.day.slice(8))}</span>
                    <Dots day={d} people={people} />
                  </button>
                ) : (
                  <div key={d.day} aria-hidden="true" className="min-h-20 rounded-lg border border-border bg-surface-muted opacity-50" />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {open && (
        <BriefDayDialog day={open} people={people} items={model.itemsByDay[open] ?? []} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
