import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { computeKpi } from "@/lib/kpi/metrics";
import { loadKpiRequests, loadTargets } from "@/lib/kpi/queries";
import { monthLabel } from "@/lib/kpi/months";
import { teamSummary } from "@/lib/kpi/presentation";
import { formatCount } from "@/lib/kpi/format";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { TeamTable, type TeamRow } from "@/components/kpi/TeamTable";
import { AccessDenied } from "@/components/AccessDenied";
import { TeamKpiSkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiTile } from "@/components/ui/KpiTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { CircleCheckBig, Gauge, Users } from "lucide-react";
import { parseMonthParam } from "../params";

async function TeamContent({ searchParams }: { searchParams: PageProps<"/dashboard/team">["searchParams"] }) {
  const viewer = await requireUserOrRedirect();
  if (!can(viewer.appRole, "dashboard.team")) {
    // Same pattern as the personal page: an inline message, never the data.
    return <AccessDenied description="The team KPI page is only available to leads and admins." backHref="/dashboard" backLabel="Back to My KPI" />;
  }
  const month = parseMonthParam((await searchParams).month);
  const [targets, requests] = await Promise.all([loadTargets(prisma, [month]), loadKpiRequests(prisma, [month])]);
  const people = await prisma.user.findMany({
    where: { OR: [{ id: { in: targets.map((t) => t.userId) } }, { active: true, jobRole: { in: ["DESIGNER", "SOCIAL_MEDIA"] } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, jobRole: true },
  });
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
      <PageHeader title="Team KPI" description={monthLabel(month)} actions={<MonthPicker month={month} action="/dashboard/team" />} />
      {rows.length === 0 ? (
        <EmptyState icon={<Users />} title="No team members to show" description="No designers or social media staff yet." />
      ) : (
        <div className="space-y-4">
          <section aria-labelledby="team-summary">
            <h2 id="team-summary" className="sr-only">Team summary</h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <li data-kpi="people"><KpiTile icon={<Users />} tone="in-progress" label="People" value={formatCount(summary.people)} className="h-full" /></li>
              <li data-kpi="tasksDone"><KpiTile icon={<CircleCheckBig />} tone="done" label="Tasks done" value={formatCount(summary.tasksDone)} className="h-full" /></li>
              <li data-kpi="avgProgress">
                <KpiTile icon={<Gauge />} tone="first-look" label="Average progress" value={summary.avgProgress === null ? "—" : `${summary.avgProgress}%`}
                  sub={summary.avgProgress === null ? "Nobody has a target this month." : `Across ${summary.withTarget} ${summary.withTarget === 1 ? "person" : "people"} with a target.`} className="h-full" />
              </li>
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
