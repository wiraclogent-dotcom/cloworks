import { Suspense } from "react";
import Link from "next/link";
import { JobRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { computeKpi } from "@/lib/kpi/metrics";
import { loadKpiRequests, loadTargets } from "@/lib/kpi/queries";
import { monthLabel, trailingMonths } from "@/lib/kpi/months";
import { formatCount, formatDays, formatPercent } from "@/lib/kpi/format";
import { ProgressBar } from "@/components/kpi/ProgressBar";
import { StatCard } from "@/components/kpi/StatCard";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { TrendChart, type TrendPoint } from "@/components/kpi/TrendChart";
import { parseMonthParam, parseUserParam, resolveSubject } from "./params";

async function DashboardContent({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const viewer = await requireUser();
  const sp = await searchParams;
  if (!can(viewer.appRole, "dashboard.self")) {
    return <p role="alert">You do not have access to the KPI dashboard.</p>;
  }
  const month = parseMonthParam(sp.month);
  // `user=` is honoured only for dashboard.team viewers; for everyone else it is ignored (own data).
  const subjectId = resolveSubject(viewer, parseUserParam(sp.user));
  const subject = await prisma.user.findUnique({ where: { id: subjectId }, select: { id: true, name: true, jobRole: true } });
  if (!subject) return <p role="alert">Person not found.</p>;

  const months = trailingMonths(month, 6);
  const [requests, targets] = await Promise.all([loadKpiRequests(prisma, months), loadTargets(prisma, months, subject.id)]);
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
  const own = subject.id === viewer.id;
  const canTeam = can(viewer.appRole, "dashboard.team");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{own ? "My KPI" : `KPI: ${subject.name}`}</h1>
          <p className="text-muted-foreground">{monthLabel(month)}</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-3">
          {!own && canTeam ? <Link href={`/dashboard/team?month=${month}`} className="rounded-md px-2 py-1 text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring">Back to team</Link> : null}
          <MonthPicker month={month} userId={own ? undefined : subject.id} action="/dashboard" />
        </div>
      </div>

      {isEmpty ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-muted-foreground">
          No target and no finished work for {monthLabel(month)} yet. {canTeam ? "Set a target on the Team KPI page." : "Ask your lead to set a monthly target."}
        </p>
      ) : (
        <div className="space-y-4">
          <section aria-labelledby="headline" className="rounded-lg border border-border bg-card p-4 text-card-foreground">
            <h2 id="headline" className="mb-2 text-sm text-muted-foreground">Tasks done vs target</h2>
            <ProgressBar done={kpi.tasksDone} target={kpi.target} progress={kpi.progress} label={`Tasks done vs target, ${monthLabel(month)}`} />
            {target?.note ? <p className="mt-2 text-sm text-muted-foreground">Note: {target.note}</p> : null}
          </section>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="On-time rate" value={formatPercent(kpi.onTimeRate)} hint={kpi.onTimeRate === null ? "No finished tasks with a deadline this month." : undefined} />
            <StatCard label="Avg turnaround (working days)" value={formatDays(kpi.avgTurnaroundDays)} hint={kpi.avgTurnaroundDays === null ? "No finished tasks this month." : undefined} />
            <StatCard label="Revision rounds" value={formatCount(kpi.revisionRounds)} />
            <StatCard label="Total outputs" value={formatCount(kpi.totalOutputs)} />
            <StatCard label="Active workload" value={basisRole === JobRole.DESIGNER ? formatCount(kpi.activeWorkload) : "—"} hint={basisRole === JobRole.DESIGNER ? "Open requests assigned to this person." : "Only tracked for designers."} />
          </dl>
          <TrendChart points={points} />
        </div>
      )}
    </>
  );
}

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <main className="mx-auto w-full max-w-[96rem] p-4 sm:p-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading KPI…</p>}>
        <DashboardContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
