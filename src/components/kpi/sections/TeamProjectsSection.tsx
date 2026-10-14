import type { ScopedDb } from "@/lib/db";
import { kpiHref } from "@/lib/kpi/href";
import { loadRosterEntries, rosterCandidates } from "@/lib/kpi/roster";
import { loadTeamProjectKpi, targetYears } from "@/lib/kpi/projectQueries";
import { KpiSection } from "@/components/kpi/KpiSection";
import { ManagePeopleDialog } from "@/components/kpi/ManagePeopleDialog";
import { ProjectTeamTable, projectTeamRows } from "@/components/kpi/project/ProjectTeamTable";
import { YearSelect } from "@/components/kpi/project/YearSelect";

/**
 * Team KPI › Projects: each person's Project KPI for `year`, roster-resolved. `keep` is the Requests section's params
 * (month) so changing the year leaves them alone; the year links land on `#projects`. `autoScroll` is for legacy
 * `?view=projects` links.
 */
export async function TeamProjectsSection({ db, year, canManage, keep, autoScroll }: {
  db: ScopedDb; year: number; canManage: boolean; keep?: Record<string, string | undefined>; autoScroll?: boolean;
}) {
  const now = new Date();
  const [{ entries, kpis }, years, candidates] = await Promise.all([
    loadRosterEntries(db, "PROJECTS").then(async (entries) => ({
      entries,
      kpis: await loadTeamProjectKpi(db, year, now, {
        extraUserIds: entries.filter((e) => e.included).map((e) => e.userId),
        excludeUserIds: entries.filter((e) => !e.included).map((e) => e.userId),
      }),
    })),
    targetYears(db),
    canManage ? rosterCandidates(db) : Promise.resolve([]),
  ]);
  // An empty table is "hidden" when removals took out people who do have targets this year.
  const removed = entries.filter((e) => !e.included).map((e) => e.userId);
  const hiddenByRoster = kpis.length === 0 && removed.length > 0 && (await db.projectKpiTarget.count({ where: { year, userId: { in: removed } } })) > 0;
  const yearOptions = [...(years.includes(year) ? years : [year, ...years])].sort((a, b) => b - a);
  return (
    <KpiSection id="projects" title="Projects" autoScroll={autoScroll} controls={<>
      <YearSelect value={year} options={yearOptions.map((y) => ({ year: y, href: kpiHref("/dashboard/team", { ...keep, year: String(y) }, "projects") }))} />
      {canManage ? <ManagePeopleDialog kind="PROJECTS" candidates={candidates} selected={kpis.map((k) => k.userId)} year={year} /> : null}
    </>}>
      <ProjectTeamTable rows={projectTeamRows(kpis)} year={year} canOpen={canManage} hiddenByRoster={hiddenByRoster} />
    </KpiSection>
  );
}
