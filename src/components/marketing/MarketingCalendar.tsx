"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { buildMonthGrid } from "@/lib/calendar";
import { buildMarketingWeeks } from "@/lib/marketing/layout";
import type { MarketingMonthData } from "@/lib/marketing/types";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { EmptyState } from "../ui/EmptyState";
import { cn, focusRing } from "../ui/cn";
import { WeekBlock } from "./WeekBlock";
import { MarketingAgenda } from "./MarketingAgenda";
import { useNarrow } from "../useNarrow";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The month grid with one lane per division in every week, and the legend chips that filter divisions (spec 2026-10-19). */
export function MarketingCalendar({ data }: { data: MarketingMonthData }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const grid = useMemo(() => buildMonthGrid(data.month, data.today), [data.month, data.today]);
  const weeks = useMemo(() => buildMarketingWeeks(grid.weeks, data.divisions, data.activities), [grid, data]);
  const activities = useMemo(() => new Map(data.activities.map((a) => [a.id, a])), [data.activities]);
  const editable = useMemo(() => new Set(data.editableDivisionIds), [data.editableDivisionIds]);
  const visible = data.divisions.filter((d) => !hidden.has(d.id));
  const narrow = useNarrow();

  if (data.divisions.length === 0) {
    return (
      <EmptyState icon={<CalendarRange />} title="No divisions on the Marketing Calendar yet"
        description="An admin picks which divisions get a lane, their colour and their leads."
        action={data.canManageMonth ? <Button asChild variant="outline" size="sm"><Link href="/admin/calendar">Set up divisions</Link></Button> : undefined} />
    );
  }

  const toggle = (id: string) => setHidden((h) => {
    const next = new Set(h);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <section aria-label="Marketing calendar">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ul aria-label="Divisions" className="flex flex-wrap gap-2">
          {data.divisions.map((d) => {
            const on = !hidden.has(d.id);
            return (
              <li key={d.id}>
                <button type="button" aria-pressed={on} onClick={() => toggle(d.id)} data-tone={d.tone}
                  className={cn("inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-compact transition-colors duration-150",
                    on ? "border-border-strong bg-card text-foreground" : "border-dashed border-border bg-transparent text-muted-foreground", focusRing)}>
                  <span aria-hidden="true" className={cn("size-2.5 rounded-xs", on ? "bg-tone-accent" : "border border-tone-accent")} />
                  {d.name}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="ml-auto text-xs text-muted-foreground">Solid = confirmed · dashed = planned · ✓ done</p>
      </div>
      {narrow && visible.length > 0 ? <MarketingAgenda data={data} divisions={visible} /> : (
        <Card className="overflow-x-auto p-3 shadow-none">
          {visible.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3 py-6">
              <p className="text-sm text-muted-foreground">All divisions are hidden.</p>
              <Button variant="outline" size="sm" onClick={() => setHidden(new Set())}>Show all</Button>
            </div>
          ) : (
            <div className="min-w-[44rem] space-y-1.5">
              <div aria-hidden="true" className="grid grid-cols-[5.5rem_repeat(7,minmax(0,1fr))] gap-x-1">
                <span />
                {WEEKDAYS.map((w) => <span key={w} className="px-1.5 text-xs font-medium text-muted-foreground">{w}</span>)}
              </div>
              {weeks.map((w) => (
                <WeekBlock key={w.days[0].day} week={w} divisions={visible} activities={activities} editable={editable} />
              ))}
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
