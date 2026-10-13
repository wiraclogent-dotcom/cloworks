import Link from "next/link";
import { Target } from "lucide-react";
import type { PersonProjectKpi } from "@/lib/kpi/projectQueries";
import { EmptyState } from "@/components/ui/EmptyState";
import { tableClass } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";

export type ProjectTeamRow = {
  userId: string;
  name: string;
  /** Q1..Q4 scores, null = no data. */
  quarters: (number | null)[];
  year: number | null;
  done: number;
  items: number;
  /** On time share of the finished scheduled items, 0..100, null when none finished. */
  onTimePct: number | null;
};

/** One row per person who has targets this year. Done / items / on time are summed over the scored quarters. */
export function projectTeamRows(kpis: (PersonProjectKpi & { name: string })[]): ProjectTeamRow[] {
  return kpis
    .filter((k) => k.unscheduled.length + k.excluded.length + ([1, 2, 3, 4] as const).reduce((n, q) => n + k.quarters[q].items.length, 0) > 0)
    .map((k) => {
      const qs = ([1, 2, 3, 4] as const).map((q) => k.quarters[q].score);
      const onTime = qs.reduce((n, s) => n + s.onTimeCount, 0);
      const late = qs.reduce((n, s) => n + s.lateCount, 0);
      return {
        userId: k.userId, name: k.name, quarters: qs.map((s) => s.score), year: k.yearScore,
        done: qs.reduce((n, s) => n + s.done, 0), items: qs.reduce((n, s) => n + s.items, 0),
        onTimePct: onTime + late === 0 ? null : Math.round((onTime / (onTime + late)) * 100),
      };
    });
}

const cmp = (a: ProjectTeamRow, b: ProjectTeamRow) =>
  a.year === b.year ? a.name.localeCompare(b.name) : a.year === null ? 1 : b.year === null ? -1 : b.year - a.year;

/** Team › Projects: score per quarter and for the year, highest year score first, people without a score last. */
export function ProjectTeamTable({ rows, year, canOpen = true }: { rows: ProjectTeamRow[]; year: number; canOpen?: boolean }) {
  if (rows.length === 0) {
    return <EmptyState art="empty-kpi" icon={<Target />} title={`No project targets for ${year} yet.`} description="Add targets from a person's Project KPI page." />;
  }
  const t = tableClass({ minWidth: "min-w-[40rem]" });
  const num = (v: number | null, suffix = "") => (v === null ? "—" : `${v}${suffix}`);
  return (
    <div className={t.wrapper}>
      <table className={t.table}>
        <caption className="sr-only">Project KPI per person for {year}</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(t.th, "w-full")}>Person</th>
            {["Q1", "Q2", "Q3", "Q4", "Year"].map((h) => <th key={h} scope="col" className={cn(t.th, t.numeric)}>{h}</th>)}
            <th scope="col" className={cn(t.th, t.numeric)}>Done</th>
            <th scope="col" className={cn(t.th, t.numeric)}>On time</th>
          </tr>
        </thead>
        <tbody>
          {[...rows].sort(cmp).map((r) => (
            <tr key={r.userId} className={t.tr}>
              <th scope="row" className={cn(t.rowHeader, "text-left")}>
                {canOpen ? <Link href={`/dashboard/projects/${r.userId}?year=${year}`} className="rounded hover:underline">{r.name}</Link> : r.name}
              </th>
              {r.quarters.map((s, i) => <td key={i} className={cn(t.td, t.numeric)}>{num(s)}</td>)}
              <td className={cn(t.td, t.numeric, "font-semibold")}>{num(r.year)}</td>
              <td className={cn(t.td, t.numeric)}>{r.done}/{r.items}</td>
              <td className={cn(t.td, t.numeric)}>{num(r.onTimePct, "%")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
