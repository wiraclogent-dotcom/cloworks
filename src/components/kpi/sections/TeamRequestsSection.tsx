import { CircleCheckBig, Gauge, Users } from "lucide-react";
import type { ScopedDb } from "@/lib/db";
import { computeKpi } from "@/lib/kpi/metrics";
import { loadKpiRequests, loadTargets } from "@/lib/kpi/queries";
import { jakartaMonth } from "@/lib/kpi/months";
import { teamSummary } from "@/lib/kpi/presentation";
import { formatCount } from "@/lib/kpi/format";
import { listTeamKpiPeople } from "@/lib/team";
import { loadRosterEntries, rosterCandidates, rosterPeople } from "@/lib/kpi/roster";
import { KpiSection } from "@/components/kpi/KpiSection";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { ManagePeopleDialog } from "@/components/kpi/ManagePeopleDialog";
import { TeamTable, type TeamRow } from "@/components/kpi/TeamTable";
import { EmptyState } from "@/components/ui/EmptyState";

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

/**
 * Team KPI › Requests: the month's summary scorecard and the per-person table. `keep` is the Projects section's
 * params (year, q) so changing the month leaves them alone. Loads its own data, so it can stream in on its own.
 */
export async function TeamRequestsSection({ db, month, canManage, keep }: {
  db: ScopedDb; month: string; canManage: boolean; keep?: Record<string, string | undefined>;
}) {
  const [targets, requests, entries, candidates] = await Promise.all([
    loadTargets(db, [month]), loadKpiRequests(db, [month]), loadRosterEntries(db, "REQUESTS"),
    canManage ? rosterCandidates(db) : Promise.resolve([]),
  ]);
  const automatic = await listTeamKpiPeople(db, targets);
  const people = await rosterPeople(db, automatic, entries);
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
    <KpiSection id="requests" title="Requests" controls={<>
      <MonthPicker month={month} current={jakartaMonth(new Date())} action="/dashboard/team" keep={keep} />
      {canManage ? <ManagePeopleDialog kind="REQUESTS" candidates={candidates} selected={people.map((p) => p.id)} month={month} /> : null}
    </>}>
      {rows.length === 0 ? (
        automatic.length > 0 ? (
          <EmptyState art="empty-kpi" icon={<Users />} title="No one is shown." description={canManage ? "Use Manage people to add someone." : undefined} />
        ) : (
          <EmptyState art="empty-kpi" icon={<Users />} title="No team members to show" description="No creative team members yet." />
        )
      ) : (
        <div className="space-y-5">
          <section aria-labelledby="team-summary">
            <h3 id="team-summary" className="sr-only">Team summary</h3>
            {/* One scorecard, like My KPI: hairlines come from the grid gap showing the border colour between cells. */}
            <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card sm:grid-cols-3">
              <ScoreCell kpi="people" icon={<Users />} label="People" value={formatCount(summary.people)} />
              <ScoreCell kpi="tasksDone" icon={<CircleCheckBig />} label="Tasks done" value={formatCount(summary.tasksDone)} />
              <ScoreCell kpi="avgProgress" icon={<Gauge />} label="Average progress" value={summary.avgProgress === null ? "—" : `${summary.avgProgress}%`}
                hint={summary.avgProgress === null ? "Nobody has a target this month." : `Across ${summary.withTarget} ${summary.withTarget === 1 ? "person" : "people"} with a target.`} />
            </ul>
          </section>
          <section aria-labelledby="team-table">
            <h3 id="team-table" className="sr-only">People</h3>
            <TeamTable rows={rows} month={month} canEdit={canManage} canOpen={canManage} />
          </section>
        </div>
      )}
    </KpiSection>
  );
}
