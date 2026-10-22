import { ChartColumn, CalendarCheck, CircleCheckBig, Clock, Gauge, Layers, Repeat, Target } from "lucide-react";
import type { JobRole } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";
import { myRequestsData } from "@/lib/kpi/pageData";
import { jakartaMonth, monthLabel } from "@/lib/kpi/months";
import { StatCard } from "@/components/ui/StatCard";
import { myKpiTiles, type KpiTileData } from "@/lib/kpi/presentation";
import type { Tone } from "@/lib/palette";
import { KpiSection } from "@/components/kpi/KpiSection";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { ProgressBar } from "@/components/kpi/ProgressBar";
import { TrendChart } from "@/components/kpi/TrendChart";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardHeader, CardTitle } from "@/components/shadcn/card";
import { MEASURE_LABEL } from "@/lib/kpi/team";

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
 * My KPI › Requests (or Content Plan for a social media basis: approved posts): the person's month (tiles, target progress, six-month trend). `keep` is the Projects section's
 * params (year, q) so changing the month leaves them alone. When nothing happened that month and there is no target,
 * a single line replaces the content (the header and picker stay).
 */
export async function MyRequestsSection({ db, subject, own, month, keep }: {
  db: ScopedDb; subject: { id: string; name: string; jobRole: JobRole }; own: boolean; month: string;
  keep?: Record<string, string | undefined>;
}) {
  const { kpi, target, basisRole, measure, points, isEmpty } = await myRequestsData(db, subject.id, subject.jobRole, month);
  const label = MEASURE_LABEL[measure];
  const headline = `${label.done} vs target, ${monthLabel(month)}`;

  // Tasks done is on the page summary now; the rest stay as this person's detail. An odd count widens the last tile.
  const tiles = myKpiTiles(kpi, basisRole).filter((t) => t.key !== "tasksDone");
  return (
    <KpiSection id="requests" title={label.section}
      controls={<MonthPicker month={month} current={jakartaMonth(new Date())} userId={own ? undefined : subject.id} action="/dashboard" keep={keep} />}>
      {isEmpty ? (
        <Card className="px-4 py-3"><EmptyState size="inline" title={measure === "posts" ? `No Content Plan posts approved in ${monthLabel(month)}.` : `No request work in ${monthLabel(month)}.`} /></Card>
      ) : (
        <div className="space-y-5">
          <section aria-labelledby="kpi-numbers">
            <h3 id="kpi-numbers" className="sr-only">Key numbers</h3>
            {/* One card per number (V3), the first solid blue. */}
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {tiles.map((tile, i) => (
                <StatCard key={tile.key} data-kpi={tile.key} icon={TILE_LOOK[tile.key].icon} label={tile.label} value={tile.value} hint={tile.hint} solid={i === 0}
                  className={cn(i === tiles.length - 1 && tiles.length % 2 === 1 && "col-span-2 lg:col-span-1")} />
              ))}
            </ul>
          </section>
          <Card>
            <section aria-labelledby="headline">
              <CardHeader className="mb-4">
                <CardTitle id="headline" as="h3">Monthly target</CardTitle>
                <p className="text-compact text-muted-foreground">{headline}</p>
              </CardHeader>
              <ProgressBar done={kpi.tasksDone} target={kpi.target} progress={kpi.progress} label={headline} />
              {target?.note ? <p className="mt-3 text-sm text-muted-foreground">Note: {target.note}</p> : null}
            </section>
          </Card>
          <TrendChart points={points} headingLevel={3} doneLabel={label.done} />
        </div>
      )}
    </KpiSection>
  );
}
