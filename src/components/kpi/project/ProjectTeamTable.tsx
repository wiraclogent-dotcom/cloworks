import Link from "next/link";
import { Target, Users } from "lucide-react";
import type { JobRole } from "@prisma/client";
import { hasProjectTargets, type PersonProjectKpi } from "@/lib/kpi/projectQueries";
import { EmptyState } from "@/components/ui/EmptyState";
import { TeamPersonCell, TeamTableFrame } from "@/components/kpi/TeamTableParts";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
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
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className="w-full">Person</TableHead>
          {["Q1", "Q2", "Q3", "Q4", "Year"].map((h) => <TableHead key={h} scope="col" numeric>{h}</TableHead>)}
          <TableHead scope="col" numeric>Done</TableHead>
          <TableHead scope="col" numeric>On time</TableHead>
          {canOpen ? <TableHead scope="col" className="w-44">Targets</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...rows].sort(cmp).map((r) => (
          <TableRow key={r.userId}>
            <TeamPersonCell name={r.name} role={r.role} href={canOpen ? hrefOf(r.userId) : undefined} />
            {r.quarters.map((s, i) => <TableCell key={i} numeric>{num(s)}</TableCell>)}
            <TableCell numeric className="font-semibold">{num(r.year)}</TableCell>
            <TableCell numeric>{r.done}/{r.items}</TableCell>
            <TableCell numeric>{num(r.onTimePct, "%")}</TableCell>
            {canOpen ? (
              <TableCell>
                <Button asChild variant="outline" size="sm"><Link href={hrefOf(r.userId)} aria-label={`${r.hasTargets ? "Open" : "Set"} targets for ${r.name}`}>{r.hasTargets ? "Open" : "Set targets"}</Link></Button>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </TeamTableFrame>
  );
}
