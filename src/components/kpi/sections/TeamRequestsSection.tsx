import { Users } from "lucide-react";
import type { ScopedDb } from "@/lib/db";
import { jakartaMonth } from "@/lib/kpi/months";
import { rosterCandidates } from "@/lib/kpi/roster";
import { teamRequestsData } from "@/lib/kpi/pageData";
import { KpiSection } from "@/components/kpi/KpiSection";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { ManagePeopleDialog } from "@/components/kpi/ManagePeopleDialog";
import { TeamTable } from "@/components/kpi/TeamTable";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Team KPI › Requests: the per-person table for the month (the summary is at the top of the page). `keep` is the Projects section's
 * params (year, q) so changing the month leaves them alone. Loads its own data, so it can stream in on its own.
 */
export async function TeamRequestsSection({ db, month, canManage, keep }: {
  db: ScopedDb; month: string; canManage: boolean; keep?: Record<string, string | undefined>;
}) {
  const [{ rows, automaticCount }, candidates] = await Promise.all([
    teamRequestsData(db, month),
    canManage ? rosterCandidates(db) : Promise.resolve([]),
  ]);
  return (
    <KpiSection id="requests" title="Requests" controls={<>
      <MonthPicker month={month} current={jakartaMonth(new Date())} action="/dashboard/team" keep={keep} />
      {canManage ? <ManagePeopleDialog kind="REQUESTS" candidates={candidates} selected={rows.map((r) => r.userId)} month={month} /> : null}
    </>}>
      {rows.length === 0 ? (
        automaticCount > 0 ? (
          <EmptyState icon={<Users />} title="No one is shown." description={canManage ? "Use Manage people to add someone." : undefined} />
        ) : (
          <EmptyState icon={<Users />} title="No team members to show" description="No creative team members yet." />
        )
      ) : (
        <TeamTable rows={rows} month={month} canEdit={canManage} canOpen={canManage} />
      )}
    </KpiSection>
  );
}
