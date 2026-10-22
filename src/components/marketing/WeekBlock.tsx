"use client";

import { Plus } from "lucide-react";
import type { MarketingWeek } from "@/lib/marketing/layout";
import type { CalActivity, CalDivision } from "@/lib/marketing/types";
import { rangeLabel } from "@/lib/marketing/format";
import { dayLabel } from "@/lib/calendar";
import { cn, focusRing } from "../ui/cn";
import { ActivityBar } from "./ActivityBar";
import { useMarketingSheet } from "./sheetState";

const ROW = "1.625rem";

/**
 * One week of the Marketing Calendar: day numbers, then one lane per visible division, labelled on the left
 * (spec 2026-10-19). Every position is a CSS grid line.
 */
export function WeekBlock({ week, divisions, activities, editable }: {
  week: MarketingWeek; divisions: CalDivision[]; activities: Map<string, CalActivity>; editable: ReadonlySet<string>;
}) {
  const sheet = useMarketingSheet();
  const byId = new Map(divisions.map((d) => [d.id, d]));
  const lanes = week.lanes.filter((l) => byId.has(l.divisionId));
  const rowCount = lanes.reduce((n, l) => n + l.rows.length, 0);
  const first = week.days[0].day;
  // Grid rows: 1 = day numbers, then each lane's rows in order.
  const laneStarts = lanes.reduce<number[]>((acc, l, i) => [...acc, i === 0 ? 2 : acc[i - 1] + lanes[i - 1].rows.length], []);

  return (
    <div role="group" aria-label={`Week of ${dayLabel(first).split(" ").slice(1).join(" ")}`}
      className="grid grid-cols-[5.5rem_repeat(7,minmax(0,1fr))] gap-x-1"
      style={{ gridTemplateRows: `1.75rem repeat(${rowCount}, ${ROW}) 0.375rem` }}>
      {week.days.map((d, i) => (
        <div key={d.day} aria-hidden="true" style={{ gridColumn: i + 2, gridRow: "1 / -1" }}
          className={cn("rounded-lg border", d.isToday ? "border-ring" : "border-border", d.inMonth && d.weekday < 5 ? "bg-card" : "bg-muted")} />
      ))}
      {week.days.map((d, i) => (
        <p key={`n-${d.day}`} style={{ gridColumn: i + 2, gridRow: 1 }} aria-current={d.isToday ? "date" : undefined}
          className="relative z-10 flex items-center gap-1 px-1.5 text-xs">
          <span className={cn("inline-flex size-6 items-center justify-center rounded-full tabular-nums",
            d.isToday ? "bg-accent font-semibold text-accent-foreground" : d.inMonth ? "text-foreground" : "text-muted-foreground")}>{Number(d.day.slice(8))}</span>
          {d.isToday ? <span className="font-medium text-link">Today</span> : null}
        </p>
      ))}

      {lanes.map((lane, li) => {
        const division = byId.get(lane.divisionId)!;
        const start = laneStarts[li];
        const covered = new Set(lane.rows[0].flatMap((s) => Array.from({ length: s.span }, (_, k) => s.col + k)));
        return (
          <div key={lane.divisionId} className="contents">
            <div data-lane-rule="" aria-hidden="true" style={{ gridColumn: "2 / -1", gridRow: start }} className="relative z-[5] self-start border-t border-dashed border-border" />
            <p data-tone={division.tone} style={{ gridColumn: 1, gridRow: `${start} / span ${lane.rows.length}` }}
              className="flex min-w-0 items-start gap-1.5 border-t border-dashed border-border pt-1.5 pr-1 text-xs text-muted-foreground">
              <span aria-hidden="true" className="mt-0.5 size-2 shrink-0 rounded-xs bg-tone-accent" />
              <span className="truncate">{division.name}</span>
            </p>
            {editable.has(lane.divisionId) ? week.days.map((d, i) => covered.has(i + 1) ? null : (
              <button key={`add-${d.day}`} type="button" aria-label={`Add activity to ${division.name} on ${rangeLabel(d.day, d.day)}`}
                onClick={() => sheet.open({ mode: "new", divisionId: lane.divisionId, day: d.day })}
                style={{ gridColumn: i + 2, gridRow: start }}
                className={cn("group/add relative z-10 mx-1 mt-0.5 flex cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted", focusRing)}>
                <Plus aria-hidden="true" strokeWidth={1.75} className="size-3.5 opacity-0 group-hover/add:opacity-100 group-focus-visible/add:opacity-100" />
              </button>
            )) : null}
            {lane.rows.flatMap((segments, r) => segments.map((s) => {
              const a = activities.get(s.id);
              return a ? (
                <div key={`${s.id}-${r}`} className="relative z-20 min-w-0 px-1 pt-0.5" style={{ gridColumn: `${s.col + 1} / span ${s.span}`, gridRow: start + r }}>
                  <ActivityBar activity={a} division={division} segment={s} onOpen={() => sheet.open({ mode: "edit", activityId: a.id })} />
                </div>
              ) : null;
            }))}
          </div>
        );
      })}
    </div>
  );
}
