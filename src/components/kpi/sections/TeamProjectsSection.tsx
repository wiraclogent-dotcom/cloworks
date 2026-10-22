import type { ScopedDb } from "@/lib/db";
import { kpiHref } from "@/lib/kpi/href";
import { rosterCandidates } from "@/lib/kpi/roster";
import { targetYears } from "@/lib/kpi/projectQueries";
import { teamProjectsData } from "@/lib/kpi/pageData";
import { KpiSection } from "@/components/kpi/KpiSection";
import { ManagePeopleDialog } from "@/components/kpi/ManagePeopleDialog";
import { ProjectTeamTable, projectTeamRows } from "@/components/kpi/project/ProjectTeamTable";
import { YearSelect } from "@/components/kpi/project/YearSelect";
import type { KpiTeam } from "@/lib/kpi/team";

/**
 * Team KPI › Projects: each person's Project KPI for `year`, roster-resolved. `keep` is the Requests section's params
 * (month) so changing the year leaves them alone; the year links land on `#projects`. `autoScroll` is for legacy
 * `?view=projects` links.
 */
export async function TeamProjectsSection({ db, year, canManage, keep, autoScroll, team = "creative" }: {
  db: ScopedDb; year: number; canManage: boolean; keep?: Record<string, string | undefined>; autoScroll?: boolean; team?: KpiTeam;
}) {
  const [{ kpis, hiddenByRoster }, years, candidates] = await Promise.all([
    teamProjectsData(db, year, team),
    targetYears(db),
    canManage ? rosterCandidates(db, team) : Promise.resolve([]),
  ]);
  const yearOptions = [...(years.includes(year) ? years : [year, ...years])].sort((a, b) => b - a);
  return (
    <KpiSection id="projects" title="Projects" autoScroll={autoScroll} controls={<>
      <YearSelect value={year} options={yearOptions.map((y) => ({ year: y, href: kpiHref("/dashboard/team", { ...keep, year: String(y) }, "projects") }))} />
      {canManage ? <ManagePeopleDialog kind="PROJECTS" candidates={candidates} selected={kpis.map((k) => k.userId)} year={year} team={team} /> : null}
    </>}>
      <ProjectTeamTable rows={projectTeamRows(kpis)} year={year} canOpen={canManage} hiddenByRoster={hiddenByRoster} />
    </KpiSection>
  );
}
