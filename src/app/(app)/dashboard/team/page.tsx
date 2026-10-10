import type { Metadata } from "next";
import { Suspense } from "react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { computeKpi } from "@/lib/kpi/metrics";
import { loadKpiRequests, loadTargets } from "@/lib/kpi/queries";
import { jakartaMonth, monthLabel } from "@/lib/kpi/months";
import { teamSummary } from "@/lib/kpi/presentation";
import { formatCount } from "@/lib/kpi/format";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { TeamTable, type TeamRow } from "@/components/kpi/TeamTable";
import { AccessDenied } from "@/components/AccessDenied";
import { TeamKpiSkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { CircleCheckBig, Gauge, Users } from "lucide-react";
import { listTeamKpiPeople } from "@/lib/team";
import { parseMonthParam } from "../params";

/** One cell of the summary scorecard: small label with its icon, the number, and an optional hint. */
function ScoreCell({ kpi, icon, label, value, hint }: { kpi: string; icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <li data-kpi={kpi} className="flex min-w-0 flex-col gap-2 bg-card p-4">
      <span className="flex items-center gap-1.5 text-[13px] text-foreground-secondary">
        <span aria-hidden="true" className="text-foreground-muted [&_svg]:size-3.5">{icon}</span>
        {label}
      </span>
      <span className="text-2xl leading-8 font-semibold text-foreground tabular-nums">{value}</span>
      {hint ? <span className="text-xs leading-4 text-foreground-secondary">{hint}</span> : null}
    </li>
  );
}

/** Tab title: "Team KPI · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Team KPI" };

async function TeamContent({ searchParams }: { searchParams: PageProps<"/dashboard/team">["searchParams"] }) {
  const { user: viewer, db } = await requireScope();
  if (!can(viewer.appRole, "dashboard.team")) {
    // Same pattern as the personal page: an inline message, never the data.
    return <AccessDenied description="The team KPI page is only available to leads and admins." backHref="/dashboard" backLabel="Back to My KPI" />;
  }
  const month = parseMonthParam((await searchParams).month);
  const [targets, requests] = await Promise.all([loadTargets(db, [month]), loadKpiRequests(db, [month])]);
  const people = await listTeamKpiPeople(db, targets);
  const rows: TeamRow[] = people.map((u) => {
    const t = targets.find((x) => x.userId === u.id) ?? null;
    return {
      userId: u.id,
      name: u.name,
      role: t?.role ?? u.jobRole,
      note: t?.note ?? null,
      kpi: computeKpi(requests, u, month, t ? { role: t.role, targetTasks: t.targetTasks } : null),
    };
  });
  const summary = teamSummary(rows);
  return (
    <>
      <PageHeader breadcrumb={[{ label: "Insights" }, { label: "Team KPI" }]} title="Team KPI" description={monthLabel(month)} actions={<MonthPicker month={month} current={jakartaMonth(new Date())} action="/dashboard/team" />} />
      {rows.length === 0 ? (
        <EmptyState icon={<Users />} title="No team members to show" description="No creative team members yet." />
      ) : (
        <div className="space-y-5">
          <section aria-labelledby="team-summary">
            <h2 id="team-summary" className="sr-only">Team summary</h2>
            {/* One scorecard, like My KPI: hairlines come from the grid gap showing the border colour between cells. */}
            <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card sm:grid-cols-3">
              <ScoreCell kpi="people" icon={<Users />} label="People" value={formatCount(summary.people)} />
              <ScoreCell kpi="tasksDone" icon={<CircleCheckBig />} label="Tasks done" value={formatCount(summary.tasksDone)} />
              <ScoreCell kpi="avgProgress" icon={<Gauge />} label="Average progress" value={summary.avgProgress === null ? "—" : `${summary.avgProgress}%`}
                hint={summary.avgProgress === null ? "Nobody has a target this month." : `Across ${summary.withTarget} ${summary.withTarget === 1 ? "person" : "people"} with a target.`} />
            </ul>
          </section>
          <section aria-labelledby="team-table">
            <h2 id="team-table" className="sr-only">People</h2>
            <TeamTable rows={rows} month={month} canEdit />
          </section>
        </div>
      )}
    </>
  );
}

export default function TeamKpiPage({ searchParams }: PageProps<"/dashboard/team">) {
  return (
    <div>
      <Suspense fallback={<TeamKpiSkeleton />}>
        <TeamContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
