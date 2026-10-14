import { ChartColumn, CalendarCheck, CircleCheckBig, Clock, Gauge, Layers, Repeat, Target } from "lucide-react";
import type { JobRole } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";
import { myRequestsData } from "@/lib/kpi/pageData";
import { jakartaMonth, monthLabel } from "@/lib/kpi/months";
import { myKpiTiles, type KpiTileData } from "@/lib/kpi/presentation";
import type { Tone } from "@/lib/palette";
import { KpiSection } from "@/components/kpi/KpiSection";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { ProgressBar } from "@/components/kpi/ProgressBar";
import { TrendChart } from "@/components/kpi/TrendChart";
import { cn } from "@/components/ui/cn";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";

const TILE_LOOK: Record<KpiTileData["key"], { icon: React.ReactNode; tone: Tone }> = {
  tasksDone: { icon: <CircleCheckBig />, tone: "done" },
  target: { icon: <Target />, tone: "in-progress" },
  progress: { icon: <Gauge />, tone: "done" },
  onTime: { icon: <CalendarCheck />, tone: "in-progress" },
  turnaround: { icon: <Clock />, tone: "first-look" },
  revisions: { icon: <Repeat />, tone: "requested" },
  outputs: { icon: <Layers />, tone: "tag-clogent" },
  workload: { icon: <ChartColumn />, tone: "due-soon" },
};

/**
 * My KPI › Requests: the person's month (tiles, target progress, six-month trend). `keep` is the Projects section's
 * params (year, q) so changing the month leaves them alone. When nothing happened that month and there is no target,
 * a single line replaces the content (the header and picker stay).
 */
export async function MyRequestsSection({ db, subject, own, month, keep }: {
  db: ScopedDb; subject: { id: string; name: string; jobRole: JobRole }; own: boolean; month: string;
  keep?: Record<string, string | undefined>;
}) {
  const { kpi, target, basisRole, points, isEmpty } = await myRequestsData(db, subject.id, subject.jobRole, month);

  // Tasks done is on the page summary now; the rest stay as this person's detail. An odd count widens the last tile.
  const tiles = myKpiTiles(kpi, basisRole).filter((t) => t.key !== "tasksDone");
  return (
    <KpiSection id="requests" title="Requests"
      controls={<MonthPicker month={month} current={jakartaMonth(new Date())} userId={own ? undefined : subject.id} action="/dashboard" keep={keep} />}>
      {isEmpty ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">No request work in {monthLabel(month)}.</p>
      ) : (
        <div className="space-y-5">
          <section aria-labelledby="kpi-numbers">
            <h3 id="kpi-numbers" className="sr-only">Key numbers</h3>
            {/* One scorecard: the hairlines come from the grid gap showing the card's border colour between cells. */}
            <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card lg:grid-cols-4">
              {tiles.map((tile, i) => (
                <li key={tile.key} data-kpi={tile.key} className={cn("flex min-w-0 flex-col gap-2 bg-card p-4", i === tiles.length - 1 && tiles.length % 2 === 1 && "col-span-2")}>
                  <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <span aria-hidden="true" className="text-foreground-muted [&_svg]:size-3.5">{TILE_LOOK[tile.key].icon}</span>
                    {tile.label}
                  </span>
                  <span className="text-2xl leading-8 font-semibold text-foreground tabular-nums">{tile.value}</span>
                  {tile.hint ? <span className="text-xs leading-4 text-muted-foreground">{tile.hint}</span> : null}
                </li>
              ))}
            </ul>
          </section>
          <Card>
            <section aria-labelledby="headline">
              <CardHeader className="mb-4">
                <CardTitle id="headline" as="h3">Monthly target</CardTitle>
                <p className="text-[13px] text-muted-foreground">Tasks done vs target, {monthLabel(month)}</p>
              </CardHeader>
              <ProgressBar done={kpi.tasksDone} target={kpi.target} progress={kpi.progress} label={`Tasks done vs target, ${monthLabel(month)}`} />
              {target?.note ? <p className="mt-3 text-sm text-muted-foreground">Note: {target.note}</p> : null}
            </section>
          </Card>
          <TrendChart points={points} headingLevel={3} />
        </div>
      )}
    </KpiSection>
  );
}
