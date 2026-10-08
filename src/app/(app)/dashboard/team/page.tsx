import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { computeKpi } from "@/lib/kpi/metrics";
import { loadKpiRequests, loadTargets } from "@/lib/kpi/queries";
import { monthLabel } from "@/lib/kpi/months";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { TeamTable, type TeamRow } from "@/components/kpi/TeamTable";
import { parseMonthParam } from "../params";

async function TeamContent({ searchParams }: { searchParams: PageProps<"/dashboard/team">["searchParams"] }) {
  const viewer = await requireUser();
  if (!can(viewer.appRole, "dashboard.team")) {
    // Same pattern as the personal page: an inline message, never the data.
    return (
      <div role="alert" className="rounded-md border border-border p-6">
        <h1 className="text-xl font-semibold">403 · Access denied</h1>
        <p className="text-muted-foreground">The team KPI page is only available to leads and admins.</p>
      </div>
    );
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
      kpi: computeKpi(requests, u, month, t ? { role: t.role, targetTasks: t.targetTasks } : null),
    };
  });
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Team KPI</h1>
          <p className="text-muted-foreground">{monthLabel(month)}</p>
        </div>
        <div className="ml-auto"><MonthPicker month={month} action="/dashboard/team" /></div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-muted-foreground">No designers or social media staff yet.</p>
      ) : (
        <TeamTable rows={rows} month={month} canEdit />
      )}
    </>
  );
}

export default function TeamKpiPage({ searchParams }: PageProps<"/dashboard/team">) {
  return (
    <main className="mx-auto w-full max-w-[96rem] p-4 sm:p-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading team KPI…</p>}>
        <TeamContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
