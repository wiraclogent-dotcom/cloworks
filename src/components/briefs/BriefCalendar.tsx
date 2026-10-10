"use client";

import { useState } from "react";
import type { BriefDay, BriefItem, BriefMonth, BriefPerson } from "@/lib/briefCalendar";
import { avatarColor } from "@/lib/palette";
import { dayLabel, utc, weekdayOf } from "@/lib/calendar";
import { useNarrow } from "../useNarrow";
import { cn, focusRing } from "../ui/cn";
import { BriefDayDialog } from "./BriefDayDialog";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MAX_DOTS = 4;
/** Category colours by the type's fixed slot (its place in the workspace's type list), so a type keeps its colour every month. */
const TYPE_FILLS = ["bg-chart-cat-1", "bg-chart-cat-2", "bg-chart-cat-3", "bg-chart-cat-4", "bg-chart-cat-5"];
function typeFill(order: string[], name: string): string {
  const i = order.indexOf(name);
  return i >= 0 && i < TYPE_FILLS.length ? TYPE_FILLS[i] : "bg-chart-cat-other";
}
/** Heat-map tint per level (1–4) on the first-look accent; 0 stays plain. */
// Capped at 55% so the tone text on the darkest cell stays AA (4.5:1) in both themes.
const HEAT = ["", "bg-tone-accent/15", "bg-tone-accent/28", "bg-tone-accent/42", "bg-tone-accent/55"];

const briefs = (n: number) => (n === 1 ? "1 brief" : `${n} briefs`);
const dayAria = (d: BriefDay) =>
  `${dayLabel(d.day)}: ${d.count === 0 ? "no briefs" : `${briefs(d.count)}, ${d.people.map((p) => `${p.person.name} ${p.count}`).join(", ")}`}`;
/** "Thu 8 Oct" */
const shortDay = (day: string) => `${WEEKDAYS[weekdayOf(utc(day))]} ${Number(day.slice(8))} ${MONTH_SHORT[Number(day.slice(5, 7)) - 1]}`;
/** 0 for none, else 1–4 relative to the busiest cell. */
const heatLevel = (v: number, max: number) => (v === 0 || max === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li aria-label={label} className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="text-[13px] text-foreground-secondary">{label}</span>
      <span className="text-right">
        <span className="text-base font-semibold text-foreground tabular-nums">{value}</span>
        {note && <span className="ml-1.5 text-xs text-foreground-secondary tabular-nums">{note}</span>}
      </span>
    </li>
  );
}

/** One bar per day of the month; the busiest day is solid, future days are a flat stub. */
function DayStrip({ days, busiest }: { days: BriefDay[]; busiest: BriefMonth["summary"]["busiest"] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const label = busiest ? `Briefs per day: busiest ${shortDay(busiest.day)} with ${briefs(busiest.count)}` : "Briefs per day: none yet";
  return (
    <div data-tone="first-look" className="mt-4">
      <div role="img" aria-label={label} className="flex h-12 items-end gap-[3px]">
        {days.map((d) => {
          const top = busiest?.day === d.day;
          return (
            <span key={d.day} data-bar="" data-busiest={top ? "" : undefined} title={`${shortDay(d.day)} · ${briefs(d.count)}`}
              style={{ height: d.isFuture || d.count === 0 ? 3 : `${Math.max(8, (d.count / max) * 100)}%` }}
              className={cn("min-w-0 flex-1 rounded-[2px]", d.isFuture || d.count === 0 ? "bg-border" : top ? "bg-tone-accent" : "bg-tone-accent/40")} />
          );
        })}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between text-[11px] text-foreground-secondary">
        <span>{shortDay(days[0].day).slice(4)}</span><span>{shortDay(days[days.length - 1].day).slice(4)}</span>
      </div>
    </div>
  );
}

/** A person's circle in their avatar colour, the count inside above 1 (same look as the original brief calendar). */
function Dot({ person, count, size = "size-5" }: { person: BriefPerson; count?: number; size?: string }) {
  const c = avatarColor(person.name);
  return (
    <span aria-hidden="true" data-person={person.id} style={{ backgroundColor: c.tint, color: c.text, borderColor: c.text }}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full border-2 text-[11px] leading-none font-semibold tabular-nums", size)}>
      {count && count > 1 ? count : null}
    </span>
  );
}

/** `align` keeps the tooltip on screen: grow rightwards early in the week, leftwards late in the week. */
function Dots({ day, items, align }: { day: BriefDay; items: BriefItem[]; align: "start" | "end" }) {
  const shown = day.people.slice(0, MAX_DOTS);
  const more = day.people.length - shown.length;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map(({ person, count }) => (
        <span key={person.id} className="group/dot relative inline-flex">
          <Dot person={person} count={count} />
          {/* Pointer-only hint; the day button's aria-label already carries the same counts for screen readers. */}
          <span aria-hidden="true" data-tooltip=""
            className={cn("pointer-events-none absolute top-full z-20 mt-1.5 hidden w-max max-w-72 rounded-md bg-foreground px-2.5 py-1.5 text-left text-xs text-background shadow-raised group-hover/dot:block", align === "start" ? "left-0" : "right-0")}>
            <span className="block font-semibold">{`${person.name} · ${briefs(count)}`}</span>
            <span className="mt-1 block space-y-0.5">
              {items.filter((it) => it.requesterId === person.id).map((it) => <span key={it.id} className="block truncate">{it.title}</span>)}
            </span>
          </span>
        </span>
      ))}
      {more > 0 && (
        <span aria-hidden="true" data-more="" className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-border-strong px-1 text-[11px] leading-none font-semibold text-foreground-secondary tabular-nums">
          +{more}
        </span>
      )}
    </span>
  );
}

/**
 * Brief calendar (spec 2026-10-10, updated): a month summary, each requester's briefs per week, then a Monday-first
 * month grid (a day list on narrow screens) with each day's brief count. Every in-month day opens that day's briefs.
 */
export function BriefCalendar({ model, typeOrder }: {
  model: BriefMonth;
  /** Every request type's name in its fixed order (loadTypeOrder). Without it, the month's own types sorted by name. */
  typeOrder?: string[];
}) {
  const order = typeOrder ?? model.summary.byType.map((t) => t.name).sort((a, b) => a.localeCompare(b));
  const narrow = useNarrow();
  const [open, setOpen] = useState<string | null>(null);
  const days = model.weeks.flat().filter((d) => d.inMonth);
  const s = model.summary;
  const heatMax = Math.max(0, ...model.rows.flatMap((r) => r.perWeek));

  return (
    <div className="space-y-5">
      <section aria-label="Month summary" className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
        <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <li aria-label="Briefs this month" className="min-w-0">
            <span className="text-[13px] text-foreground-secondary">Briefs this month</span>
            <span className="mt-0.5 block text-4xl leading-none font-semibold tracking-tight text-foreground tabular-nums">{s.total}</span>
            <DayStrip days={days} busiest={s.busiest} />
          </li>
          <li className="min-w-0 self-end">
            <ul>
              <Stat label="Today" value={s.today === null ? "—" : String(s.today)} />
              <Stat label="Per work day" value={s.perWorkday === null ? "—" : s.perWorkday.toFixed(1)} note="Mon–Sat" />
              <Stat label="Busiest day" value={s.busiest ? shortDay(s.busiest.day) : "—"} note={s.busiest ? briefs(s.busiest.count) : undefined} />
            </ul>
            {s.byType.length > 0 && (
              <div className="mt-3">
                <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                  {s.byType.map((t) => (
                    <span key={t.name} className={typeFill(order, t.name)} style={{ width: `${(t.count / s.total) * 100}%` }} />
                  ))}
                </div>
                <p aria-label="Briefs by type" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground-secondary tabular-nums">
                  {s.byType.map((t) => (
                    <span key={t.name} className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className={cn("size-2 rounded-full", typeFill(order, t.name))} />{`${t.name} ${t.count}`}
                    </span>
                  ))}
                </p>
              </div>
            )}
          </li>
        </ul>
      </section>

      <section aria-labelledby="brief-weeks-h" className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <h2 id="brief-weeks-h" className="border-b border-border px-4 py-3 text-sm font-semibold text-heading">Briefs per requester, per week</h2>
        {model.rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-foreground-secondary">No briefs this month yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Briefs per requester per week" data-tone="first-look" className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs text-foreground-secondary">
                  <th scope="col" className="px-4 py-2 font-medium">Requester</th>
                  {model.weekCols.map((w) => <th key={w.label} scope="col" className="px-2 py-2 text-center font-medium whitespace-nowrap">{w.label}</th>)}
                  <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {model.rows.map((r) => (
                  <tr key={r.person.id}>
                    <td className="px-4 py-2 font-medium whitespace-nowrap text-foreground">
                      <span className="inline-flex items-center gap-2"><Dot person={r.person} size="size-4" />{r.person.name}</span>
                    </td>
                    {r.perWeek.map((c, i) => {
                      const started = model.weekCols[i].started;
                      const level = heatLevel(c, heatMax);
                      return (
                        <td key={model.weekCols[i].label} data-level={started ? level : undefined} className="px-2 py-1.5 text-center">
                          {started ? (
                            <span className={cn("inline-flex h-7 min-w-10 items-center justify-center rounded-md px-1.5", level === 0 ? "text-foreground-secondary" : "font-medium text-tone-text", HEAT[level])}>{c}</span>
                          ) : <span className="text-foreground-secondary">–</span>}
                        </td>
                      );
                    })}
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
                <Dots day={d} items={model.itemsByDay[d.day] ?? []} align="end" />
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
                      "flex min-h-20 min-w-0 flex-col items-start gap-1.5 rounded-lg border p-1.5 text-left hover:bg-surface-muted",
                      d.isDayOff ? "bg-surface-muted" : "bg-surface",
                      d.isToday ? "border-ring" : "border-border hover:border-border-strong",
                      d.isFuture && "opacity-60",
                      focusRing,
                    )}>
                    <span aria-hidden="true" className="flex w-full items-center justify-between">
                      <span className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        d.isToday ? "bg-accent font-semibold text-accent-foreground" : d.isDayOff ? "text-foreground-secondary" : "text-foreground",
                      )}>{Number(d.day.slice(8))}</span>
                      {d.count > 0 && <span data-day-total="" className="pr-0.5 text-[11px] text-foreground-secondary tabular-nums">{d.count}</span>}
                    </span>
                    <Dots day={d} items={model.itemsByDay[d.day] ?? []} align={d.weekday >= 4 ? "end" : "start"} />
                  </button>
                ) : (
                  <div key={d.day} aria-hidden="true" className="min-h-20 rounded-lg border border-border bg-surface-muted opacity-50" />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {model.rows.length > 0 && (
        <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-foreground-secondary">
          {model.rows.map((r) => (
            <li key={r.person.id} className="flex items-center gap-1.5"><Dot person={r.person} size="size-3" />{r.person.name}</li>
          ))}
        </ul>
      )}

      {open && <BriefDayDialog day={open} items={model.itemsByDay[open] ?? []} onClose={() => setOpen(null)} />}
    </div>
  );
}
