import { Check } from "lucide-react";
import type { JobRole } from "@prisma/client";
import { formatCount, formatDays, formatPercent, progressPercent } from "@/lib/kpi/format";
import type { KpiResult } from "@/lib/kpi/metrics";
import { PROGRESS_LEVEL_LABEL, progressLevel } from "@/lib/kpi/presentation";
import { Progress } from "@/components/shadcn/progress";
import { cn } from "@/components/ui/cn";
import { PROGRESS_FILL } from "./ProgressBar";
import { TargetEditor } from "./TargetEditor";
import { TeamPersonCell, TeamTableFrame, teamT as t } from "./TeamTableParts";

export type TeamRow = { userId: string; name: string; role: JobRole; kpi: KpiResult; note?: string | null };

/** Compact per-person bar: colour by threshold (see PROGRESS_THRESHOLDS), always with the % as text (+ check at ≥ 100%). */
export function TeamProgress({ name, pct }: { name: string; pct: number }) {
  const level = progressLevel(pct);
  return (
    <div data-level={level} className="flex items-center gap-2">
      <Progress aria-label={`${name} progress`} aria-valuetext={`${pct}%`} value={Math.min(100, pct)} className="w-16 shrink-0" indicatorClassName={PROGRESS_FILL[level]} />
      <span className="inline-flex items-center gap-0.5 tabular-nums">
        {level === "complete" ? <Check aria-hidden="true" strokeWidth={2.25} className="size-3.5 text-progress-complete" /> : null}
        {pct}%
        <span className="sr-only"> ({PROGRESS_LEVEL_LABEL[level]})</span>
      </span>
    </div>
  );
}

/** `canOpen`: names link to each person's KPI page (leads and admins; for everyone else `user=` is ignored). */
export function TeamTable({ rows, month, canEdit, canOpen = true }: { rows: TeamRow[]; month: string; canEdit: boolean; canOpen?: boolean }) {
  // ≥ 1024px (lg) the table fits its card: no min width, Turnaround and Workload only from xl (1280px), compact editor.
  // Below lg it keeps a min width and scrolls sideways inside the card, with a visible hint.
  const xlOnly = "hidden xl:table-cell";
  return (
    <TeamTableFrame caption="KPI per person for the selected month" minWidth={canEdit ? "min-w-[46rem] lg:min-w-0" : "min-w-[36rem] lg:min-w-0"}>
      <thead>
        <tr>
          <th scope="col" className={cn(t.th, "w-full")}>Person</th>
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
              <TeamPersonCell name={r.name} role={r.role} href={canOpen ? `/dashboard?user=${encodeURIComponent(r.userId)}&month=${month}` : undefined} />
              <td className={cn(t.td, t.numeric)}>{r.kpi.tasksDone}</td>
              <td className={cn(t.td, t.numeric)}>{formatCount(r.kpi.target)}</td>
              <td className={t.td}>{pct === null ? <span className="text-muted-foreground">—</span> : <TeamProgress name={r.name} pct={pct} />}</td>
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
    </TeamTableFrame>
  );
}
