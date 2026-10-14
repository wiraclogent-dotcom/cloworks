import type { ReactNode } from "react";
import { Target } from "lucide-react";
import type { Quarter } from "@/lib/kpi/projectItems";
import type { PersonProjectKpi } from "@/lib/kpi/projectQueries";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ProjectScoreHeader } from "./ProjectScoreHeader";
import { TargetList } from "./TargetList";
import { YearSelect } from "./YearSelect";

const QUARTERS: Quarter[] = [1, 2, 3, 4];

/**
 * A person's Project KPI for one year: score header, quarter tabs (links) with a year select, the targets of the
 * chosen tab, the "Not scored" group and collapsed "Other work". Server component: `hrefFor` builds the URL for a
 * change of year and/or tab, so any page (the person page, the Insights view) can host it. `manage` is the
 * manager's "Manage targets" control, shown only when `canManage`.
 */
export function ProjectKpiPanel({ kpi, quarter, years, canManage, hrefFor, manage, yearSelect = true, headingLevel = 2 }: {
  kpi: PersonProjectKpi;
  quarter: Quarter | "u";
  years: number[];
  canManage: boolean;
  hrefFor: (p: { year?: number; q?: string }) => string;
  manage?: ReactNode;
  /** False when the host page already shows the year picker (the My KPI Projects section header). */
  yearSelect?: boolean;
  /** Level of the "Not scored" heading: 3 when the panel sits under a section's h2. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const unscheduled = quarter === "u";
  const q = unscheduled ? null : kpi.quarters[quarter];
  const items = unscheduled ? kpi.unscheduled : kpi.quarters[quarter].items;
  const yearOptions = years.includes(kpi.year) ? years : [kpi.year, ...years].sort((a, b) => b - a);
  const tab = String(quarter);
  const tabs = [
    ...QUARTERS.map((n) => ({ value: String(n), label: `Q${n}`, href: hrefFor({ year: kpi.year, q: String(n) }) })),
    { value: "u", label: "Unscheduled", href: hrefFor({ year: kpi.year, q: "u" }) },
  ];
  const showManage = canManage && manage;

  return (
    <div className="space-y-5">
      {q ? (
        <ProjectScoreHeader label={`Q${quarter} ${kpi.year} score`} score={q.score.score} parts={q.score.parts} usedParts={q.score.usedParts}
          sub={`Year ${kpi.year}: ${kpi.yearScore ?? "—"}`} />
      ) : (
        <ProjectScoreHeader label="Year score" score={kpi.yearScore} sub={`${kpi.year}, across all quarters. Unscheduled targets are not scored.`} />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl label="Quarter" items={tabs} value={tab} />
          {yearSelect ? <YearSelect value={kpi.year} options={yearOptions.map((y) => ({ year: y, href: hrefFor({ year: y, q: tab }) }))} /> : null}
        </div>
        {showManage && items.length > 0 ? manage : null}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Target />} title={unscheduled ? "No unscheduled targets." : "No targets due this quarter."}
          description={unscheduled ? "Targets without a due date, or due in another year, show up here." : "Items with a due date in this quarter that are targeted on this person show up here."}
          action={showManage ? manage : undefined} />
      ) : (
        <TargetList items={items} canManage={canManage} />
      )}

      {kpi.excluded.length > 0 ? (
        <section aria-labelledby="not-scored" className="space-y-2">
          <div>
            <Heading id="not-scored" className="text-sm font-semibold text-muted-foreground">Not scored</Heading>
            <p className="text-xs text-muted-foreground">Cancelled items and items removed from their project do not count.</p>
          </div>
          <TargetList items={kpi.excluded} canManage={canManage} muted />
        </section>
      ) : null}

      {kpi.otherWork.length > 0 ? (
        <details className="group rounded-xl border border-border bg-card shadow-card">
          <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium text-foreground select-none">Other work ({kpi.otherWork.length})</summary>
          <div className="border-t border-border">
            <p className="px-4 pt-3 text-xs text-muted-foreground">Items this person owns rows in that are not targets. Not scored.</p>
            <TargetList items={kpi.otherWork} canManage={false} muted bare />
          </div>
        </details>
      ) : null}
    </div>
  );
}
