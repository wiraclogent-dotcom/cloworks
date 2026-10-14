import type { ScopedDb } from "@/lib/db";
import type { Quarter } from "@/lib/kpi/projectItems";
import { loadPersonProjectKpi, targetYears } from "@/lib/kpi/projectQueries";
import { ProjectKpiPanel } from "./ProjectKpiPanel";
import { ManageTargetsModal } from "./ManageTargetsModal";

/**
 * A person's Project KPI for `year`: loads the KPI, the year list and (for managers) the project list, then renders
 * the panel with the Manage targets control. Shared by the person page and My KPI › Projects; each page owns the
 * URL shape through `hrefFor`.
 */
export async function PersonProjectKpiSection({ db, userId, name, year, quarter, canManage, hrefFor, yearSelect, headingLevel }: {
  db: ScopedDb; userId: string; name: string; year: number; quarter: Quarter | "u"; canManage: boolean;
  hrefFor: (p: { year?: number; q?: string }) => string;
  /** Pass false when the host shows its own year picker. */
  yearSelect?: boolean;
  headingLevel?: 2 | 3;
}) {
  const [kpi, years, projects] = await Promise.all([
    loadPersonProjectKpi(db, userId, year, new Date()),
    targetYears(db),
    canManage ? db.project.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }) : Promise.resolve([]),
  ]);
  return (
    <ProjectKpiPanel kpi={kpi} quarter={quarter} years={years} canManage={canManage} hrefFor={hrefFor} yearSelect={yearSelect} headingLevel={headingLevel}
      manage={canManage ? <ManageTargetsModal userId={userId} name={name} year={year} projects={projects} /> : undefined} />
  );
}
