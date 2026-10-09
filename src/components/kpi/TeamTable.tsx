import Link from "next/link";
import { Check, MoveHorizontal } from "lucide-react";
import type { JobRole } from "@prisma/client";
import { formatCount, formatDays, formatPercent, progressPercent } from "@/lib/kpi/format";
import type { KpiResult } from "@/lib/kpi/metrics";
import { PROGRESS_LEVEL_LABEL, progressLevel } from "@/lib/kpi/presentation";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { tableClass } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { PROGRESS_FILL } from "./ProgressBar";
import { TargetEditor } from "./TargetEditor";

export type TeamRow = { userId: string; name: string; role: JobRole; kpi: KpiResult; note?: string | null };

export const JOB_ROLE_LABEL: Record<JobRole, string> = { DESIGNER: "Designer", SOCIAL_MEDIA: "Social media", OTHER: "Other" };

/** Compact per-person bar: colour by threshold (see PROGRESS_THRESHOLDS), always with the % as text (+ check at ≥ 100%). */
export function TeamProgress({ name, pct }: { name: string; pct: number }) {
  const level = progressLevel(pct);
  return (
    <div data-level={level} className="flex items-center gap-2">
      <div role="progressbar" aria-label={`${name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pct)} aria-valuetext={`${pct}%`}
        className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-surface-muted outline outline-1 -outline-offset-1 outline-border">
        <div className={cn("h-full rounded-full", PROGRESS_FILL[level])} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="inline-flex items-center gap-0.5 tabular-nums">
        {level === "complete" ? <Check aria-hidden="true" strokeWidth={2.25} className="size-3.5 text-progress-complete" /> : null}
        {pct}%
        <span className="sr-only"> ({PROGRESS_LEVEL_LABEL[level]})</span>
      </span>
    </div>
  );
}

export function TeamTable({ rows, month, canEdit }: { rows: TeamRow[]; month: string; canEdit: boolean }) {
  // ≥ 1024px (lg) the table fits its card: no min width, Turnaround and Workload only from xl (1280px), compact editor.
  // Below lg it keeps a min width and scrolls sideways inside the card, with a visible hint.
  const t = tableClass({ minWidth: canEdit ? "min-w-[46rem] lg:min-w-0" : "min-w-[36rem] lg:min-w-0" });
  const xlOnly = "hidden xl:table-cell";
  return (
    <>
    <p data-scroll-hint="" className="mb-2 flex items-center gap-1.5 text-xs text-foreground-secondary lg:hidden">
      <MoveHorizontal aria-hidden="true" strokeWidth={1.75} className="size-3.5" />Scroll sideways to see every column.
    </p>
    <div className={cn(t.wrapper, "max-h-[calc(100dvh-16rem)]")}>
      <table className={t.table}>
        <caption className="sr-only">KPI per person for the selected month</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(t.th, "w-full")}>Name</th>
            <th scope="col" className={cn(t.th, t.numeric, "w-24")}>Tasks done</th>
            <th scope="col" className={cn(t.th, t.numeric, "w-20")}>Target</th>
            <th scope="col" className={cn(t.th, "w-40")}>Progress</th>
            <th scope="col" className={cn(t.th, t.numeric, "w-24")}>On-time</th>
            <th scope="col" className={cn(t.th, t.numeric, xlOnly, "w-32")}>Turnaround (days)</th>
            <th scope="col" className={cn(t.th, t.numeric, xlOnly, "w-24")}>Workload</th>
            {canEdit ? <th scope="col" className={cn(t.th, "w-44")}>Set target</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = progressPercent(r.kpi.progress);
            return (
              <tr key={r.userId} className={t.tr}>
                <th scope="row" className={t.rowHeader}>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={r.name} size="md" decorative />
                    <div className="min-w-0">
                      <Link href={`/dashboard?user=${encodeURIComponent(r.userId)}&month=${month}`} className="-my-1 inline-flex min-h-7 items-center rounded-md font-medium text-foreground hover:text-link hover:underline">{r.name}</Link>
                      <div className="mt-0.5"><Chip tone="tag-neutral" data-role={r.role}>{JOB_ROLE_LABEL[r.role]}</Chip></div>
                    </div>
                  </div>
                </th>
                <td className={cn(t.td, t.numeric)}>{r.kpi.tasksDone}</td>
                <td className={cn(t.td, t.numeric)}>{formatCount(r.kpi.target)}</td>
                <td className={t.td}>{pct === null ? <span className="text-foreground-secondary">—</span> : <TeamProgress name={r.name} pct={pct} />}</td>
                <td className={cn(t.td, t.numeric)}>{formatPercent(r.kpi.onTimeRate)}</td>
                <td className={cn(t.td, t.numeric, xlOnly)}>{formatDays(r.kpi.avgTurnaroundDays)}</td>
                <td className={cn(t.td, t.numeric, xlOnly)}>{r.role === "DESIGNER" ? formatCount(r.kpi.activeWorkload) : "—"}</td>
                {canEdit ? (
                  <td className={t.td}>
                    <TargetEditor userId={r.userId} name={r.name} month={month} role={r.role} initial={r.kpi.target} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
