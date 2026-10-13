import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, ChartColumn, CircleCheckBig, Clock, Gauge, Layers, Repeat, Target, UserX } from "lucide-react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { computeKpi } from "@/lib/kpi/metrics";
import { loadKpiRequests, loadTargets } from "@/lib/kpi/queries";
import { jakartaMonth, monthLabel, trailingMonths } from "@/lib/kpi/months";
import { myKpiTiles, type KpiTileData } from "@/lib/kpi/presentation";
import { ProgressBar } from "@/components/kpi/ProgressBar";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { TrendChart, type TrendPoint } from "@/components/kpi/TrendChart";
import { AccessDenied } from "@/components/AccessDenied";
import { KpiSkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClass } from "@/components/ui/Button";
import type { Tone } from "@/lib/palette";
import { loadPersonProjectKpi, targetYears } from "@/lib/kpi/projectQueries";
import { parseProjectKpiParams } from "@/lib/kpi/projectParams";
import { ProjectKpiPanel } from "@/components/kpi/project/ProjectKpiPanel";
import { ManageTargetsModal } from "@/components/kpi/project/ManageTargetsModal";
import { KpiViewToggle } from "@/components/kpi/project/KpiViewToggle";
import type { ScopedDb } from "@/lib/db";
import { jakartaQuarter } from "@/lib/kpi/projectItems";
import { parseMonthParam, parseUserParam, parseViewParam, resolveSubject } from "./params";

/** Tab title: "My KPI · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "My KPI" };

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

/** My KPI › Projects: the person's quarterly Project KPI. Month does not apply here, so the month picker is hidden. */
async function ProjectsView({ db, subject, own, canTeam, sp }: {
  db: ScopedDb; subject: { id: string; name: string }; own: boolean; canTeam: boolean;
  sp: Awaited<PageProps<"/dashboard">["searchParams"]>;
}) {
  const now = new Date();
  const { year, quarter } = parseProjectKpiParams(sp, now);
  const [kpi, years, projects] = await Promise.all([
    loadPersonProjectKpi(db, subject.id, year, now),
    targetYears(db),
    canTeam ? db.project.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }) : Promise.resolve([]),
  ]);
  const hrefFor = (p: { year?: number; q?: string }) =>
    `/dashboard?view=projects&year=${p.year ?? year}&q=${p.q ?? quarter}${own ? "" : `&user=${encodeURIComponent(subject.id)}`}`;
  return (
    <>
      <PageHeader breadcrumb={own ? [{ label: "Insights" }, { label: "My KPI" }] : [{ label: "Insights" }, { label: "Team KPI", href: "/dashboard/team" }, { label: subject.name }]}
        title={own ? "My KPI" : `KPI: ${subject.name}`} description={`Project KPI ${year}`}
        actions={<KpiViewToggle view="projects" base="/dashboard" params={{ ...sp, view: "projects" }} explicitRequests />} />
      <ProjectKpiPanel kpi={kpi} quarter={quarter} years={years} canManage={canTeam} hrefFor={hrefFor}
        manage={canTeam ? <ManageTargetsModal userId={subject.id} name={subject.name} year={year} projects={projects} /> : undefined} />
    </>
  );
}

async function DashboardContent({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const { user: viewer, db } = await requireScope();
  const sp = await searchParams;
  if (!can(viewer.appRole, "dashboard.self")) {
    return <AccessDenied description="You do not have access to the KPI dashboard." />;
  }
  const month = parseMonthParam(sp.month);
  // `user=` is honoured only for dashboard.team viewers; for everyone else it is ignored (own data).
  const subjectId = resolveSubject(viewer, parseUserParam(sp.user));
  const subject = await db.user.findUnique({ where: { id: subjectId }, select: { id: true, name: true, jobRole: true } });
  if (!subject) {
    return (
      <EmptyState role="alert" titleAs="h1" art="empty-search" icon={<UserX />} title="Person not found." className="mx-auto mt-6 max-w-xl"
        action={<Link href="/dashboard/team" className={buttonClass({ variant: "secondary" })}><ArrowLeft aria-hidden="true" />Back to team</Link>} />
    );
  }

  const view = parseViewParam(sp.view);
  const own = subject.id === viewer.id;
  const canTeam = can(viewer.appRole, "dashboard.team");
  if (view === "projects") return <ProjectsView db={db} subject={subject} own={own} canTeam={canTeam} sp={sp} />;

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
  const isEmpty = !target && kpi.tasksDone === 0 && kpi.totalOutputs === 0 && kpi.activeWorkload === 0 && points.every((p) => p.tasksDone === 0 && p.target === null);

  // No view chosen: open on Projects when the viewer has project targets this year and nothing counted this month.
  if (view === undefined && own && kpi.tasksDone === 0 && kpi.totalOutputs === 0 && kpi.activeWorkload === 0) {
    const hasTargets = (await db.projectKpiTarget.count({ where: { userId: subject.id, year: jakartaQuarter(new Date()).year } })) > 0;
    if (hasTargets) return <ProjectsView db={db} subject={subject} own={own} canTeam={canTeam} sp={sp} />;
  }

  return (
    <>
      <PageHeader breadcrumb={own ? [{ label: "Insights" }, { label: "My KPI" }] : [{ label: "Insights" }, { label: "Team KPI", href: "/dashboard/team" }, { label: subject.name }]} title={own ? "My KPI" : `KPI: ${subject.name}`} description={monthLabel(month)}
        actions={<>
          <KpiViewToggle view="requests" base="/dashboard" params={sp} explicitRequests />
          {!own && canTeam ? <Link href={`/dashboard/team?month=${month}`} className={buttonClass({ variant: "ghost", size: "sm" })}><ArrowLeft aria-hidden="true" />Back to team</Link> : null}
          <MonthPicker month={month} current={jakartaMonth(new Date())} userId={own ? undefined : subject.id} action="/dashboard" />
        </>} />

      {isEmpty ? (
        <EmptyState art="empty-kpi" icon={<ChartColumn />} title={`No KPI data for ${monthLabel(month)}`}
          description={`No target and no finished work for ${monthLabel(month)} yet. ${canTeam ? "Set a target on the Team KPI page." : "Ask your lead to set a monthly target."}`} />
      ) : (
        <div className="space-y-5">
          <section aria-labelledby="kpi-numbers">
            <h2 id="kpi-numbers" className="sr-only">Key numbers</h2>
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
                <CardTitle id="headline">Monthly target</CardTitle>
                <p className="text-[13px] text-foreground-secondary">Tasks done vs target, {monthLabel(month)}</p>
              </CardHeader>
              <ProgressBar done={kpi.tasksDone} target={kpi.target} progress={kpi.progress} label={`Tasks done vs target, ${monthLabel(month)}`} />
              {target?.note ? <p className="mt-3 text-sm text-foreground-secondary">Note: {target.note}</p> : null}
            </section>
          </Card>
          <TrendChart points={points} />
        </div>
      )}
    </>
  );
}

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <div>
      <Suspense fallback={<KpiSkeleton />}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
