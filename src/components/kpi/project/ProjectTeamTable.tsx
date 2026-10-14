import Link from "next/link";
import { Target, Users } from "lucide-react";
import type { JobRole } from "@prisma/client";
import { hasProjectTargets, type PersonProjectKpi } from "@/lib/kpi/projectQueries";
import { EmptyState } from "@/components/ui/EmptyState";
import { TeamPersonCell, TeamTableFrame, teamT as t } from "@/components/kpi/TeamTableParts";
import { cn } from "@/components/ui/cn";
import { Button } from "@/components/shadcn/button";

export type ProjectTeamRow = {
  userId: string;
  name: string;
  role: JobRole;
  /** Q1..Q4 scores, null = no data. */
  quarters: (number | null)[];
  year: number | null;
  done: number;
  items: number;
  /** On time share of the finished scheduled items, 0..100, null when none finished. */
  onTimePct: number | null;
  /** False for someone added to the roster who has no targets this year. */
  hasTargets: boolean;
};

/** One row per person on the roster. Done / items / on time are summed over the scored quarters. */
export function projectTeamRows(kpis: (PersonProjectKpi & { name: string; jobRole: JobRole })[]): ProjectTeamRow[] {
  return kpis
    .map((k) => {
      const qs = ([1, 2, 3, 4] as const).map((q) => k.quarters[q].score);
      const onTime = qs.reduce((n, s) => n + s.onTimeCount, 0);
      const late = qs.reduce((n, s) => n + s.lateCount, 0);
      return {
        userId: k.userId, name: k.name, role: k.jobRole, quarters: qs.map((s) => s.score), year: k.yearScore,
        done: qs.reduce((n, s) => n + s.done, 0), items: qs.reduce((n, s) => n + s.items, 0),
        onTimePct: onTime + late === 0 ? null : Math.round((onTime / (onTime + late)) * 100),
        hasTargets: hasProjectTargets(k),
      };
    });
}

const cmp = (a: ProjectTeamRow, b: ProjectTeamRow) =>
  a.year === b.year ? a.name.localeCompare(b.name) : a.year === null ? 1 : b.year === null ? -1 : b.year - a.year;

/**
 * Team › Projects: score per quarter and for the year, highest year score first, people without a score last. Same
 * frame and person cell as the Requests table. `canOpen` (dashboard.team): names link to the person's targets page
 * and the last column has a Set targets / Open button.
 */
export function ProjectTeamTable({ rows, year, canOpen = true, hiddenByRoster = false }: {
  rows: ProjectTeamRow[]; year: number; canOpen?: boolean;
  /** Nobody shows because Manage people hid everyone who has targets (not because there are none). */
  hiddenByRoster?: boolean;
}) {
  if (rows.length === 0 && hiddenByRoster) {
    return <EmptyState art="empty-kpi" icon={<Users />} title={`No one is shown for ${year}.`} description={canOpen ? "Use Manage people to add someone." : undefined} />;
  }
  if (rows.length === 0) {
    return <EmptyState art="empty-kpi" icon={<Target />} title={`No project targets for ${year} yet.`} description="Add targets from a person's Project KPI page." />;
  }
  const num = (v: number | null, suffix = "") => (v === null ? "—" : `${v}${suffix}`);
  const hrefOf = (userId: string) => `/dashboard/projects/${userId}?year=${year}`;
  return (
    <TeamTableFrame caption={`Project KPI per person for ${year}`} minWidth={canOpen ? "min-w-[46rem] lg:min-w-0" : "min-w-[38rem] lg:min-w-0"}>
      <thead>
        <tr>
          <th scope="col" className={cn(t.th, "w-full")}>Person</th>
          {["Q1", "Q2", "Q3", "Q4", "Year"].map((h) => <th key={h} scope="col" className={cn(t.th, t.numeric)}>{h}</th>)}
          <th scope="col" className={cn(t.th, t.numeric)}>Done</th>
          <th scope="col" className={cn(t.th, t.numeric)}>On time</th>
          {canOpen ? <th scope="col" className={cn(t.th, "w-44")}>Targets</th> : null}
        </tr>
      </thead>
      <tbody>
        {[...rows].sort(cmp).map((r) => (
          <tr key={r.userId} className={t.tr}>
            <TeamPersonCell name={r.name} role={r.role} href={canOpen ? hrefOf(r.userId) : undefined} />
            {r.quarters.map((s, i) => <td key={i} className={cn(t.td, t.numeric)}>{num(s)}</td>)}
            <td className={cn(t.td, t.numeric, "font-semibold")}>{num(r.year)}</td>
            <td className={cn(t.td, t.numeric)}>{r.done}/{r.items}</td>
            <td className={cn(t.td, t.numeric)}>{num(r.onTimePct, "%")}</td>
            {canOpen ? (
              <td className={t.td}>
                <Button asChild variant="outline" size="sm"><Link href={hrefOf(r.userId)} aria-label={`${r.hasTargets ? "Open" : "Set"} targets for ${r.name}`}>{r.hasTargets ? "Open" : "Set targets"}</Link></Button>
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </TeamTableFrame>
  );
}
