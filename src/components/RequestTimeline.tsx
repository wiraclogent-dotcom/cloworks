"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChartNoAxesGantt, SearchX } from "lucide-react";
import type { TimelineRow } from "@/lib/requests";
import { buildWindow, layoutRows, rangeLabel } from "@/lib/workload";
import { TimelineChart } from "./timeline/TimelineChart";
import { TimelineList } from "./timeline/TimelineList";
import { EmptyState } from "./ui/EmptyState";
import { useNarrow } from "./useNarrow";
import { Button } from "@/components/shadcn/button";

/**
 * Workload per person over one Monday-start week: one section per team member (+ Unassigned), one bar per open
 * request from its request day to its deadline (overdue and no-deadline ones run to today). View-only.
 */
export function RequestTimeline({ rows, people, week, today, assigneeId, prevHref, nextHref, todayHref, filtered = false, clearHref = "/requests?view=timeline" }: {
  rows: TimelineRow[]; people: { id: string; name: string }[]; week: string; today: string;
  /** The Assignee filter: only that person's section is shown. */
  assigneeId?: string;
  prevHref: string; nextHref: string; todayHref: string;
  /** Any filter is active: the empty state then says no request matches, with a way out. */
  filtered?: boolean; clearHref?: string;
}) {
  const narrow = useNarrow();
  const win = useMemo(() => buildWindow(week, today), [week, today]);
  const persons = useMemo(() => layoutRows(rows, people, win, today, { assigneeId }), [rows, people, win, today, assigneeId]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const empty = persons.every((p) => p.count === 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-heading">{rangeLabel(win.from, win.to)}</h2>
        <nav aria-label="Weeks" className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="sm" className="px-2"><Link href={prevHref} aria-label="Previous week" title="Previous week"><ChevronLeft aria-hidden="true" strokeWidth={1.75} className="size-4" /></Link></Button>
          <Button asChild variant="ghost" size="sm" className="px-2"><Link href={nextHref} aria-label="Next week" title="Next week"><ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4" /></Link></Button>
          <Button asChild variant="outline" size="sm"><Link href={todayHref}>Today</Link></Button>
        </nav>
      </div>
      {empty ? (
        filtered ? (
          <EmptyState icon={<SearchX aria-hidden="true" strokeWidth={1.75} />} title="No requests match these filters in this week"
            description="Try another search, other weeks, or clear the filters."
            action={<Button asChild variant="outline" size="sm"><Link href={clearHref}>Clear filters</Link></Button>} />
        ) : (
          <EmptyState icon={<ChartNoAxesGantt />} title="No open requests in this week"
            description="Open requests show up here from the day they were requested to their deadline."
            action={<Button asChild variant="outline" size="sm"><Link href={todayHref}>Today</Link></Button>} />
        )
      ) : narrow ? (
        <TimelineList persons={persons} rows={byId} />
      ) : (
        <TimelineChart days={win.days} persons={persons} rows={byId} />
      )}
    </div>
  );
}
