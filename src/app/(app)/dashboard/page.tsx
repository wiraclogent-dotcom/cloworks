import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, UserX } from "lucide-react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { parseProjectKpiParams } from "@/lib/kpi/projectParams";
import { MyRequestsSection } from "@/components/kpi/sections/MyRequestsSection";
import { MyProjectsSection } from "@/components/kpi/sections/MyProjectsSection";
import { AccessDenied } from "@/components/AccessDenied";
import { KpiSectionSkeleton, KpiSkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClass } from "@/components/ui/Button";
import { kpiHref } from "@/lib/kpi/href";
import { keepParams, parseMonthParam, parseUserParam, parseViewParam, resolveSubject } from "./params";

/** Tab title: "My KPI · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "My KPI" };

/**
 * My KPI: Requests (month) and Projects (year, quarter) as two sections on one page, each loading on its own. One URL
 * carries both (`month`, `year`, `q`, and `user` for leads); each picker keeps the other's params. `?view=projects`
 * (old links) scrolls to Projects.
 */
async function DashboardContent({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const { user: viewer, db } = await requireScope();
  const sp = await searchParams;
  if (!can(viewer.appRole, "dashboard.self")) {
    return <AccessDenied description="You do not have access to the KPI dashboard." />;
  }
  const month = parseMonthParam(sp.month);
  const { year, quarter } = parseProjectKpiParams(sp);
  // `user=` is honoured only for dashboard.team viewers; for everyone else it is ignored (own data).
  const subjectId = resolveSubject(viewer, parseUserParam(sp.user));
  const subject = await db.user.findUnique({ where: { id: subjectId }, select: { id: true, name: true, jobRole: true } });
  if (!subject) {
    return (
      <EmptyState role="alert" titleAs="h1" art="empty-search" icon={<UserX />} title="Person not found." className="mx-auto mt-6 max-w-xl"
        action={<Link href="/dashboard/team" className={buttonClass({ variant: "secondary" })}><ArrowLeft aria-hidden="true" />Back to team</Link>} />
    );
  }

  const own = subject.id === viewer.id;
  const canTeam = can(viewer.appRole, "dashboard.team");
  const userKeep = own ? undefined : subject.id;
  return (
    <>
      <PageHeader breadcrumb={own ? [{ label: "Insights" }, { label: "My KPI" }] : [{ label: "Insights" }, { label: "Team KPI", href: "/dashboard/team" }, { label: subject.name }]}
        title={own ? "My KPI" : `KPI: ${subject.name}`} description="Request and project KPIs"
        actions={!own && canTeam ? <Link href={kpiHref("/dashboard/team", { month, ...keepParams(sp, ["year"]) })} className={buttonClass({ variant: "ghost", size: "sm" })}><ArrowLeft aria-hidden="true" />Back to team</Link> : null} />
      <div className="space-y-8">
        <Suspense fallback={<KpiSectionSkeleton title="Requests" tiles={4} />}>
          <MyRequestsSection db={db} subject={subject} own={own} month={month} keep={keepParams(sp, ["year", "q"])} />
        </Suspense>
        <Suspense fallback={<KpiSectionSkeleton title="Projects" tiles={0} id="projects" />}>
          <MyProjectsSection db={db} subject={subject} canTeam={canTeam} year={year} quarter={quarter}
            keep={{ ...keepParams(sp, ["month"]), user: userKeep }} autoScroll={parseViewParam(sp.view) === "projects"} />
        </Suspense>
      </div>
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
