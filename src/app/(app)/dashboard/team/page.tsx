import type { Metadata } from "next";
import { Suspense } from "react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { parseProjectKpiParams } from "@/lib/kpi/projectParams";
import { TeamRequestsSection } from "@/components/kpi/sections/TeamRequestsSection";
import { TeamProjectsSection } from "@/components/kpi/sections/TeamProjectsSection";
import { AccessDenied } from "@/components/AccessDenied";
import { KpiSectionSkeleton, TeamKpiSkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";
import { keepParams, parseMonthParam, parseViewParam } from "../params";

/** Tab title: "Team KPI · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Team KPI" };

/**
 * Team KPI: Requests (month) and Projects (year) as two sections on one page, each loading on its own. One URL carries
 * both (`month`, `year`); each picker keeps the other's param. `?view=projects` (old links) scrolls to Projects.
 */
async function TeamContent({ searchParams }: { searchParams: PageProps<"/dashboard/team">["searchParams"] }) {
  const { user: viewer, db } = await requireScope();
  if (!can(viewer.appRole, "dashboard.teamView")) {
    // Same pattern as the personal page: an inline message, never the data.
    return <AccessDenied description="You do not have access to the team KPI page." backHref="/dashboard" backLabel="Back to My KPI" />;
  }
  const sp = await searchParams;
  const month = parseMonthParam(sp.month);
  const { year } = parseProjectKpiParams(sp);
  const canManage = can(viewer.appRole, "dashboard.team");
  return (
    <>
      <PageHeader breadcrumb={[{ label: "Insights" }, { label: "Team KPI" }]} title="Team KPI" description="Request and project KPIs for the team" />
      <div className="space-y-8">
        <Suspense fallback={<KpiSectionSkeleton title="Requests" />}>
          <TeamRequestsSection db={db} month={month} canManage={canManage} keep={keepParams(sp, ["year"])} />
        </Suspense>
        <Suspense fallback={<KpiSectionSkeleton title="Projects" tiles={0} />}>
          <TeamProjectsSection db={db} year={year} canManage={canManage} keep={keepParams(sp, ["month"])} autoScroll={parseViewParam(sp.view) === "projects"} />
        </Suspense>
      </div>
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
