import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, UserX } from "lucide-react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadPersonProjectKpi, targetYears } from "@/lib/kpi/projectQueries";
import { parseProjectKpiParams } from "@/lib/kpi/projectParams";
import { ProjectKpiPanel } from "@/components/kpi/project/ProjectKpiPanel";
import { ManageTargetsModal } from "@/components/kpi/project/ManageTargetsModal";
import { AccessDenied } from "@/components/AccessDenied";
import { KpiSkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClass } from "@/components/ui/Button";
import { parseUserParam } from "../../params";

/** Tab title: "Project KPI · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Project KPI" };

async function PersonContent({ params, searchParams }: {
  params: PageProps<"/dashboard/projects/[userId]">["params"];
  searchParams: PageProps<"/dashboard/projects/[userId]">["searchParams"];
}) {
  const { user: viewer, db } = await requireScope();
  const userId = parseUserParam((await params).userId);
  const canTeam = can(viewer.appRole, "dashboard.team");
  // Own page needs dashboard.self; anyone else's needs dashboard.team. The data is never loaded before this check.
  const allowed = canTeam || (userId === viewer.id && can(viewer.appRole, "dashboard.self"));
  if (!allowed) {
    return <AccessDenied description="You do not have access to this person's project KPI." backHref="/dashboard" backLabel="Back to My KPI" />;
  }
  const subject = userId ? await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }) : null;
  if (!subject) {
    return (
      <EmptyState role="alert" titleAs="h1" art="empty-search" icon={<UserX />} title="Person not found." className="mx-auto mt-6 max-w-xl"
        action={<Link href="/dashboard/team" className={buttonClass({ variant: "secondary" })}><ArrowLeft aria-hidden="true" />Back to team</Link>} />
    );
  }

  const sp = await searchParams;
  const now = new Date();
  const { year, quarter } = parseProjectKpiParams(sp, now);
  const [kpi, years, projects] = await Promise.all([
    loadPersonProjectKpi(db, subject.id, year, now),
    targetYears(db),
    canTeam ? db.project.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }) : Promise.resolve([]),
  ]);
  const own = subject.id === viewer.id;
  const base = `/dashboard/projects/${subject.id}`;
  const hrefFor = (p: { year?: number; q?: string }) => `${base}?year=${p.year ?? year}&q=${p.q ?? quarter}`;

  return (
    <>
      <PageHeader
        breadcrumb={own && !canTeam ? [{ label: "Insights" }, { label: "My KPI", href: "/dashboard" }, { label: "Project KPI" }]
          : [{ label: "Insights" }, { label: "Team KPI", href: "/dashboard/team" }, { label: subject.name }]}
        title={`${subject.name} · Project KPI ${year}`}
        description="Quarterly score from the project items this person is measured on."
        actions={canTeam ? <Link href="/dashboard/team" className={buttonClass({ variant: "ghost", size: "sm" })}><ArrowLeft aria-hidden="true" />Back to team</Link> : undefined} />
      <ProjectKpiPanel kpi={kpi} quarter={quarter} years={years} canManage={canTeam} hrefFor={hrefFor}
        manage={canTeam ? <ManageTargetsModal userId={subject.id} name={subject.name} year={year} projects={projects} /> : undefined} />
    </>
  );
}

export default function ProjectKpiPersonPage({ params, searchParams }: PageProps<"/dashboard/projects/[userId]">) {
  return (
    <div>
      <Suspense fallback={<KpiSkeleton />}>
        <PersonContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
