import { Suspense } from "react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { parseProjectKpiParams } from "@/lib/kpi/projectParams";
import { resolveTeam } from "@/lib/kpi/team";
import { TeamSummary } from "@/components/kpi/sections/TeamSummary";
import { TeamRequestsSection } from "@/components/kpi/sections/TeamRequestsSection";
import { TeamProjectsSection } from "@/components/kpi/sections/TeamProjectsSection";
import { TeamSwitch } from "@/components/kpi/TeamSwitch";
import { AccessDenied } from "@/components/AccessDenied";
import { KpiSectionSkeleton, SummarySkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";
import { keepParams, parseMonthParam, parseTeamParam, parseViewParam, type RawParam } from "../params";

/**
 * Team KPI: a summary of both, then the main section (Requests for the creative team, Content Plan for the social
 * media team) by month and Projects by year, each loading on its own. The team follows the viewer's job role; admins
 * get a switch (`team`). One URL carries `month`, `year` and `team`; each picker keeps the others. `?view=projects`
 * (old links) scrolls to Projects. Lives outside page.tsx so tests can render it without the Suspense shell.
 */
export async function TeamContent({ searchParams }: { searchParams: Promise<Record<string, RawParam>> }) {
  const { user: viewer, db } = await requireScope();
  if (!can(viewer.appRole, "dashboard.teamView")) {
    // Same pattern as the personal page: an inline message, never the data.
    return <AccessDenied description="You do not have access to the team KPI page." backHref="/dashboard" backLabel="Back to My KPI" />;
  }
  const sp = await searchParams;
  const month = parseMonthParam(sp.month);
  const { year } = parseProjectKpiParams(sp);
  const team = resolveTeam(viewer, parseTeamParam(sp.team));
  const canManage = can(viewer.appRole, "dashboard.team");
  return (
    <>
      <PageHeader breadcrumb={[{ label: "Insights" }, { label: "Team KPI" }]} title="Team KPI"
        description={team === "social" ? "Content Plan and project KPIs for the social media team" : "Request and project KPIs for the creative team"}
        switcher={viewer.appRole === "ADMIN" ? <TeamSwitch current={team} keep={keepParams(sp, ["month", "year"])} /> : undefined} />
      <div className="space-y-8">
        <Suspense fallback={<SummarySkeleton count={5} />}>
          <TeamSummary db={db} month={month} year={year} team={team} />
        </Suspense>
        <Suspense fallback={<KpiSectionSkeleton title="Requests" tiles={0} />}>
          <TeamRequestsSection db={db} month={month} canManage={canManage} keep={keepParams(sp, ["year", "team"])} team={team} />
        </Suspense>
        <Suspense fallback={<KpiSectionSkeleton title="Projects" tiles={0} id="projects" />}>
          <TeamProjectsSection db={db} year={year} canManage={canManage} keep={keepParams(sp, ["month", "team"])} team={team} autoScroll={parseViewParam(sp.view) === "projects"} />
        </Suspense>
      </div>
    </>
  );
}
