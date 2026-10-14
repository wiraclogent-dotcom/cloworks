import Link from "next/link";
import type { ScopedDb } from "@/lib/db";
import { kpiHref } from "@/lib/kpi/href";
import { targetYears } from "@/lib/kpi/projectQueries";
import type { Quarter } from "@/lib/kpi/projectItems";
import { buttonClass } from "@/components/ui/Button";
import { KpiSection } from "@/components/kpi/KpiSection";
import { PersonProjectKpiSection } from "@/components/kpi/project/PersonProjectKpiSection";
import { YearSelect } from "@/components/kpi/project/YearSelect";

/**
 * My KPI › Projects: the person's quarterly Project KPI for `year`, under a header with the year picker. `keep` is
 * the Requests section's params (month, user) so changing the year or quarter leaves them alone; every link lands on
 * `#projects`. With no targets in the year, one line (and "Set targets" for leads) replaces the panel.
 */
export async function MyProjectsSection({ db, subject, canTeam, year, quarter, keep, autoScroll }: {
  db: ScopedDb; subject: { id: string; name: string }; canTeam: boolean; year: number; quarter: Quarter | "u";
  keep?: Record<string, string | undefined>; autoScroll?: boolean;
}) {
  const [years, targetCount] = await Promise.all([
    targetYears(db),
    db.projectKpiTarget.count({ where: { userId: subject.id, year } }),
  ]);
  const hrefFor = (p: { year?: number; q?: string }) =>
    kpiHref("/dashboard", { ...keep, year: String(p.year ?? year), q: p.q ?? String(quarter) }, "projects");
  const yearOptions = [...(years.includes(year) ? years : [year, ...years])].sort((a, b) => b - a);
  return (
    <KpiSection id="projects" title="Projects" autoScroll={autoScroll}
      controls={<YearSelect value={year} options={yearOptions.map((y) => ({ year: y, href: hrefFor({ year: y }) }))} />}>
      {targetCount === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-sm text-foreground-secondary">No project targets for {year}.</p>
          {canTeam ? <Link href={`/dashboard/projects/${subject.id}?year=${year}`} className={buttonClass({ variant: "secondary", size: "sm" })}>Set targets</Link> : null}
        </div>
      ) : (
        <PersonProjectKpiSection db={db} userId={subject.id} name={subject.name} year={year} quarter={quarter} canManage={canTeam} hrefFor={hrefFor} yearSelect={false} />
      )}
    </KpiSection>
  );
}
