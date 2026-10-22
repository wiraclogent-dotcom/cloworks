import { Check } from "lucide-react";
import type { JobRole } from "@prisma/client";
import { formatCount, formatDays, formatPercent, progressPercent } from "@/lib/kpi/format";
import type { KpiResult } from "@/lib/kpi/metrics";
import { PROGRESS_LEVEL_LABEL, progressLevel } from "@/lib/kpi/presentation";
import { Progress } from "@/components/shadcn/progress";
import { cn } from "@/components/ui/cn";
import { PROGRESS_FILL } from "./ProgressBar";
import { TargetEditor } from "./TargetEditor";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { TeamPersonCell, TeamTableFrame } from "./TeamTableParts";
import { MEASURE_LABEL, type KpiMeasure, type KpiTeam } from "@/lib/kpi/team";
import { kpiHref } from "@/lib/kpi/href";

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

/**
 * `canOpen`: names link to each person's KPI page (leads and admins; for everyone else `user=` is ignored).
 * `measure` posts (the social media team) renames Tasks done and drops Turnaround and Workload, which posts don't have.
 * `team` rides on those links so the person page leads back to this team.
 */
export function TeamTable({ rows, month, canEdit, canOpen = true, measure = "requests", team }: {
  rows: TeamRow[]; month: string; canEdit: boolean; canOpen?: boolean; measure?: KpiMeasure; team?: KpiTeam;
}) {
  const requests = measure === "requests";
  // ≥ 1024px (lg) the table fits its card: no min width, Turnaround and Workload only from xl (1280px), compact editor.
  // Below lg it keeps a min width and scrolls sideways inside the card, with a visible hint.
  const xlOnly = "hidden xl:table-cell";
  return (
    <TeamTableFrame caption={requests ? "KPI per person for the selected month" : "Content Plan KPI per person for the selected month"} minWidth={canEdit ? "min-w-[46rem] lg:min-w-0" : "min-w-[36rem] lg:min-w-0"}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className="w-full">Person</TableHead>
          <TableHead scope="col" numeric className="w-24">{MEASURE_LABEL[measure].done}</TableHead>
          <TableHead scope="col" numeric className="w-20">Target</TableHead>
          <TableHead scope="col" className="w-40">Progress</TableHead>
          <TableHead scope="col" numeric className="w-24">On-time</TableHead>
          {requests ? <TableHead scope="col" numeric className={cn(xlOnly, "w-32")}>Turnaround (days)</TableHead> : null}
          {requests ? <TableHead scope="col" numeric className={cn(xlOnly, "w-24")}>Workload</TableHead> : null}
          {canEdit ? <TableHead scope="col" className="w-44">Set target</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const pct = progressPercent(r.kpi.progress);
          return (
            <TableRow key={r.userId}>
              <TeamPersonCell name={r.name} role={r.role} href={canOpen ? kpiHref("/dashboard", { user: r.userId, month, team }) : undefined} />
              <TableCell numeric>{r.kpi.tasksDone}</TableCell>
              <TableCell numeric>{formatCount(r.kpi.target)}</TableCell>
              <TableCell>{pct === null ? <span className="text-muted-foreground">—</span> : <TeamProgress name={r.name} pct={pct} />}</TableCell>
              <TableCell numeric>{formatPercent(r.kpi.onTimeRate)}</TableCell>
              {requests ? <TableCell numeric className={xlOnly}>{formatDays(r.kpi.avgTurnaroundDays)}</TableCell> : null}
              {requests ? <TableCell numeric className={xlOnly}>{r.role === "DESIGNER" ? formatCount(r.kpi.activeWorkload) : "—"}</TableCell> : null}
              {canEdit ? (
                <TableCell>
                  <TargetEditor userId={r.userId} name={r.name} month={month} role={r.role} initial={r.kpi.target} />
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </TeamTableFrame>
  );
}
