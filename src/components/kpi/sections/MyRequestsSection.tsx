import { ChartColumn, CalendarCheck, CircleCheckBig, Clock, Gauge, Layers, Repeat, Target } from "lucide-react";
import type { JobRole } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";
import { computeKpi } from "@/lib/kpi/metrics";
import { loadKpiRequests, loadTargets } from "@/lib/kpi/queries";
import { jakartaMonth, monthLabel, trailingMonths } from "@/lib/kpi/months";
import { myKpiTiles, type KpiTileData } from "@/lib/kpi/presentation";
import type { Tone } from "@/lib/palette";
import { KpiSection } from "@/components/kpi/KpiSection";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { ProgressBar } from "@/components/kpi/ProgressBar";
import { TrendChart, type TrendPoint } from "@/components/kpi/TrendChart";
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
  const months = trailingMonths(month, 6);
  const [requests, targets] = await Promise.all([loadKpiRequests(db, months), loadTargets(db, months, subject.id)]);
  const targetOf = (m: string) => targets.find((t) => t.month === m) ?? null;
  const resultOf = (m: string) => {
    const t = targetOf(m);
    return computeKpi(requests, subject, m, t ? { role: t.role, targetTasks: t.targetTasks } : null);
  };
  const kpi = resultOf(month);
  const target = targetOf(month);
  const basisRole = target?.role ?? subject.jobRole;
  const points: TrendPoint[] = months.map((m) => {
    const r = resultOf(m);
    return { month: m, label: monthLabel(m), tasksDone: r.tasksDone, target: r.target };
  });
  const isEmpty = !target && kpi.tasksDone === 0 && kpi.totalOutputs === 0 && kpi.activeWorkload === 0;

  return (
    <KpiSection id="requests" title="Requests"
      controls={<MonthPicker month={month} current={jakartaMonth(new Date())} userId={own ? undefined : subject.id} action="/dashboard" keep={keep} />}>
      {isEmpty ? (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground-secondary">No request work in {monthLabel(month)}.</p>
      ) : (
        <div className="space-y-5">
          <section aria-labelledby="kpi-numbers">
            <h3 id="kpi-numbers" className="sr-only">Key numbers</h3>
            {/* One scorecard: the hairlines come from the grid gap showing the card's border colour between cells. */}
            <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card lg:grid-cols-4">
              {myKpiTiles(kpi, basisRole).map((tile) => (
                <li key={tile.key} data-kpi={tile.key} className="flex min-w-0 flex-col gap-2 bg-card p-4">
                  <span className="flex items-center gap-1.5 text-[13px] text-foreground-secondary">
                    <span aria-hidden="true" className="text-foreground-muted [&_svg]:size-3.5">{TILE_LOOK[tile.key].icon}</span>
                    {tile.label}
                  </span>
                  <span className="text-2xl leading-8 font-semibold text-foreground tabular-nums">{tile.value}</span>
                  {tile.hint ? <span className="text-xs leading-4 text-foreground-secondary">{tile.hint}</span> : null}
                </li>
              ))}
            </ul>
          </section>
          <Card>
            <section aria-labelledby="headline">
              <CardHeader className="mb-4">
                <CardTitle id="headline" as="h3">Monthly target</CardTitle>
                <p className="text-[13px] text-foreground-secondary">Tasks done vs target, {monthLabel(month)}</p>
              </CardHeader>
              <ProgressBar done={kpi.tasksDone} target={kpi.target} progress={kpi.progress} label={`Tasks done vs target, ${monthLabel(month)}`} />
              {target?.note ? <p className="mt-3 text-sm text-foreground-secondary">Note: {target.note}</p> : null}
            </section>
          </Card>
          <TrendChart points={points} headingLevel={3} />
        </div>
      )}
    </KpiSection>
  );
}
