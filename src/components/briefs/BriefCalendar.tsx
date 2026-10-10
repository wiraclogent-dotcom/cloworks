"use client";

import { useState } from "react";
import type { BriefDay, BriefMonth } from "@/lib/briefCalendar";
import { dayLabel, utc, weekdayOf } from "@/lib/calendar";
import { useNarrow } from "../useNarrow";
import { cn, focusRing } from "../ui/cn";
import { BriefDayDialog } from "./BriefDayDialog";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const briefs = (n: number) => (n === 1 ? "1 brief" : `${n} briefs`);
const dayAria = (d: BriefDay) => `${dayLabel(d.day)}: ${d.count === 0 ? "no briefs" : briefs(d.count)}`;
/** "Thu 8 Oct" */
const shortDay = (day: string) => `${WEEKDAYS[weekdayOf(utc(day))]} ${Number(day.slice(8))} ${MONTH_SHORT[Number(day.slice(5, 7)) - 1]}`;

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li aria-label={label} className="flex min-w-0 flex-col gap-1 bg-card p-4">
      <span className="text-[13px] text-foreground-secondary">{label}</span>
      <span className="truncate text-2xl leading-8 font-semibold text-foreground tabular-nums">{value}</span>
      {note && <span className="text-xs text-foreground-secondary tabular-nums">{note}</span>}
    </li>
  );
}

/** The day's brief count; nothing on a day without briefs. */
function Count({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span aria-hidden="true" className="inline-flex items-center rounded-full bg-tone-tint px-2 py-0.5 text-xs font-medium text-tone-text tabular-nums" data-tone="requested">
      {briefs(count)}
    </span>
  );
}

/**
 * Brief calendar (spec 2026-10-10, updated): a month summary, each requester's briefs per week, then a Monday-first
 * month grid (a day list on narrow screens) with each day's brief count. Every in-month day opens that day's briefs.
 */
export function BriefCalendar({ model }: { model: BriefMonth }) {
  const narrow = useNarrow();
  const [open, setOpen] = useState<string | null>(null);
  const days = model.weeks.flat().filter((d) => d.inMonth);
  const s = model.summary;

  return (
    <div className="space-y-5">
      <section aria-label="Month summary" className="space-y-2">
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card sm:grid-cols-4">
          <Tile label="Briefs this month" value={String(s.total)} />
          <Tile label="Today" value={s.today === null ? "—" : String(s.today)} />
          <Tile label="Per work day" value={s.perWorkday === null ? "—" : s.perWorkday.toFixed(1)} note="Average, Monday to Saturday" />
          <Tile label="Busiest day" value={s.busiest ? shortDay(s.busiest.day) : "—"} note={s.busiest ? briefs(s.busiest.count) : undefined} />
        </ul>
        {s.byType.length > 0 && (
          <p aria-label="Briefs by type" className="text-sm text-foreground-secondary tabular-nums">
            {s.byType.map((t) => `${t.name} ${t.count}`).join(" · ")}
          </p>
        )}
      </section>

      <section aria-labelledby="brief-weeks-h" className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <h2 id="brief-weeks-h" className="border-b border-border px-4 py-3 text-sm font-semibold text-heading">Briefs per requester, per week</h2>
        {model.rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-foreground-secondary">No briefs this month yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Briefs per requester per week" className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs text-foreground-secondary">
                  <th scope="col" className="px-4 py-2 font-medium">Requester</th>
                  {model.weekCols.map((w) => <th key={w.label} scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">{w.label}</th>)}
                  <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {model.rows.map((r) => (
                  <tr key={r.person.id}>
                    <td className="px-4 py-2 font-medium whitespace-nowrap text-foreground">{r.person.name}</td>
                    {r.perWeek.map((c, i) => (
                      <td key={model.weekCols[i].label} className={cn("px-3 py-2 text-right", c === 0 || !model.weekCols[i].started ? "text-foreground-muted" : "text-foreground")}>
                        {model.weekCols[i].started ? c : "–"}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-semibold text-foreground">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {narrow ? (
        <ol aria-label="Days" className="divide-y divide-border rounded-xl border border-border bg-surface">
          {days.map((d) => (
            <li key={d.day} aria-current={d.isToday ? "date" : undefined}>
              <button type="button" aria-haspopup="dialog" aria-label={dayAria(d)} onClick={() => setOpen(d.day)}
                className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm", (d.isDayOff || d.isFuture) && "text-foreground-secondary", d.isDayOff && "bg-surface-muted", focusRing)}>
                <span>{dayLabel(d.day)}{d.isToday && <span className="ml-1.5 font-medium text-link">Today</span>}</span>
                <Count count={d.count} />
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
                  <button key={d.day} type="button" aria-haspopup="dialog" aria-label={dayAria(d)} aria-current={d.isToday ? "date" : undefined}
                    onClick={() => setOpen(d.day)}
                    className={cn(
                      "flex min-h-20 min-w-0 flex-col items-start gap-1.5 rounded-lg border p-1.5 text-left hover:bg-accent",
                      d.isDayOff ? "bg-surface-muted" : "bg-surface",
                      d.isToday ? "border-ring" : "border-border",
                      d.isFuture && "opacity-60",
                      focusRing,
                    )}>
                    <span aria-hidden="true" className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                      d.isToday ? "bg-accent font-semibold text-accent-foreground" : d.isDayOff ? "text-foreground-secondary" : "text-foreground",
                    )}>{Number(d.day.slice(8))}</span>
                    <Count count={d.count} />
                  </button>
                ) : (
                  <div key={d.day} aria-hidden="true" className="min-h-20 rounded-lg border border-border bg-surface-muted opacity-50" />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {open && <BriefDayDialog day={open} items={model.itemsByDay[open] ?? []} onClose={() => setOpen(null)} />}
    </div>
  );
}
