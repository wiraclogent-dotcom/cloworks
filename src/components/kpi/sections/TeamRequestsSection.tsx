import { Download, Users } from "lucide-react";
import type { ScopedDb } from "@/lib/db";
import { jakartaMonth } from "@/lib/kpi/months";
import { rosterCandidates } from "@/lib/kpi/roster";
import { teamRequestsData } from "@/lib/kpi/pageData";
import { KpiSection } from "@/components/kpi/KpiSection";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { ManagePeopleDialog } from "@/components/kpi/ManagePeopleDialog";
import { TeamTable } from "@/components/kpi/TeamTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/shadcn/button";
import { kpiHref } from "@/lib/kpi/href";
import { MEASURE_LABEL, measureOfTeam, type KpiTeam } from "@/lib/kpi/team";

/**
 * Team KPI › Requests (Creative) or Content Plan (Social media): the per-person table for the month of `team` (the
 * summary is at the top of the page). `keep` is the Projects section's
 * params (year, q) so changing the month leaves them alone. Loads its own data, so it can stream in on its own. The month's
 * table downloads as .xlsx (route `/dashboard/team/export`) for monthly reports; hidden while nobody is shown.
 */
export async function TeamRequestsSection({ db, month, canManage, keep, team = "creative" }: {
  db: ScopedDb; month: string; canManage: boolean; keep?: Record<string, string | undefined>; team?: KpiTeam;
}) {
  const [{ rows, automaticCount }, candidates] = await Promise.all([
    teamRequestsData(db, month, team),
    canManage ? rosterCandidates(db, team) : Promise.resolve([]),
  ]);
  const measure = measureOfTeam(team);
  return (
    <KpiSection id="requests" title={MEASURE_LABEL[measure].section} controls={<>
      <MonthPicker month={month} current={jakartaMonth(new Date())} action="/dashboard/team" keep={keep} />
      {canManage ? <ManagePeopleDialog kind="REQUESTS" candidates={candidates} selected={rows.map((r) => r.userId)} month={month} team={team} /> : null}
      {rows.length > 0 ? (
        <Button asChild variant="outline">
          <a href={kpiHref("/dashboard/team/export", { month, team })} download><Download aria-hidden="true" />Download .xlsx</a>
        </Button>
      ) : null}
    </>}>
      {rows.length === 0 ? (
        automaticCount > 0 ? (
          <EmptyState icon={<Users />} title="No one is shown." description={canManage ? "Use Manage people to add someone." : undefined} />
        ) : (
          <EmptyState icon={<Users />} title="No team members to show" description={team === "social" ? "No social media team members yet." : "No creative team members yet."} />
        )
      ) : (
        <TeamTable rows={rows} month={month} canEdit={canManage} canOpen={canManage} measure={measure} team={team} />
      )}
    </KpiSection>
  );
}
