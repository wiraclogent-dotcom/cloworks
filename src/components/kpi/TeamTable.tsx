import Link from "next/link";
import type { JobRole } from "@prisma/client";
import { formatCount, formatDays, formatPercent, progressPercent } from "@/lib/kpi/format";
import type { KpiResult } from "@/lib/kpi/metrics";
import { TargetEditor } from "./TargetEditor";

export type TeamRow = { userId: string; name: string; role: JobRole; kpi: KpiResult };

const ROLE_LABEL: Record<JobRole, string> = { DESIGNER: "Designer", SOCIAL_MEDIA: "Social media", OTHER: "Other" };

export function TeamTable({ rows, month, canEdit }: { rows: TeamRow[]; month: string; canEdit: boolean }) {
  const th = "px-3 py-2 font-medium";
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card text-card-foreground">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">KPI per person for the selected month</caption>
        <thead>
          <tr className="border-b border-border bg-muted">
            <th scope="col" className={th}>Name</th>
            <th scope="col" className={th}>Role</th>
            <th scope="col" className={th}>Tasks done</th>
            <th scope="col" className={th}>Target</th>
            <th scope="col" className={th}>Progress</th>
            <th scope="col" className={th}>On-time</th>
            <th scope="col" className={th}>Turnaround (days)</th>
            <th scope="col" className={th}>Workload</th>
            {canEdit ? <th scope="col" className={th}>Set target</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = progressPercent(r.kpi.progress);
            return (
              <tr key={r.userId} className="border-b border-border last:border-0">
                <th scope="row" className="px-3 py-2 font-medium">
                  <Link href={`/dashboard?user=${encodeURIComponent(r.userId)}&month=${month}`} className="underline focus-visible:outline-2 focus-visible:outline-ring">{r.name}</Link>
                </th>
                <td className="px-3 py-2">{ROLE_LABEL[r.role]}</td>
                <td className="px-3 py-2">{r.kpi.tasksDone}</td>
                <td className="px-3 py-2">{formatCount(r.kpi.target)}</td>
                <td className="px-3 py-2">
                  {pct === null ? "—" : (
                    <div className="flex items-center gap-2">
                      <div role="progressbar" aria-label={`${r.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pct)} aria-valuetext={`${pct}%`}
                        className="h-2 w-24 overflow-hidden rounded-full bg-muted outline outline-1 -outline-offset-1 outline-border">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span>{pct}%</span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">{formatPercent(r.kpi.onTimeRate)}</td>
                <td className="px-3 py-2">{formatDays(r.kpi.avgTurnaroundDays)}</td>
                <td className="px-3 py-2">{r.role === "DESIGNER" ? formatCount(r.kpi.activeWorkload) : "—"}</td>
                {canEdit ? (
                  <td className="px-3 py-2">
                    <TargetEditor userId={r.userId} name={r.name} month={month} role={r.role} initial={r.kpi.target} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
