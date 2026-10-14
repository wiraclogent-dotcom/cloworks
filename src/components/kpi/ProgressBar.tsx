import { Check } from "lucide-react";
import { progressPercent } from "@/lib/kpi/format";
import { PROGRESS_LEVEL_LABEL, progressLevel, type ProgressLevel } from "@/lib/kpi/presentation";
import { Progress } from "@/components/shadcn/progress";
import { cn } from "@/components/ui/cn";

/** Fill colour per threshold (tokens; see PROGRESS_THRESHOLDS). Exported for the team table's compact bar. */
export const PROGRESS_FILL: Record<ProgressLevel, string> = {
  low: "bg-progress-low",
  mid: "bg-progress-mid",
  complete: "bg-progress-complete",
};

/**
 * "X of Y tasks (Z%)" with a progressbar. The visual bar is clamped at 100% but the text and
 * aria-valuenow carry the real percentage. Without a target there is nothing to measure against.
 * The fill colour follows the thresholds (< 50 amber, 50–99 blue, ≥ 100 deep blue + check); the text always carries the value.
 */
export function ProgressBar({ done, target, progress, label }: { done: number; target: number | null; progress: number | null; label: string }) {
  if (target === null) {
    return <p className="text-sm text-muted-foreground">{done} {done === 1 ? "task" : "tasks"} done. No target set for this month.</p>;
  }
  const pct = progressPercent(progress);
  const text = pct === null ? `${done} of ${target} tasks` : `${done} of ${target} tasks (${pct}%)`;
  const width = Math.min(100, Math.max(0, pct ?? 0));
  const level = pct === null ? null : progressLevel(pct);
  return (
    <div data-level={level ?? undefined}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold text-foreground tabular-nums">{text}</p>
        {level ? (
          <span className="inline-flex items-center gap-1 text-compact text-muted-foreground">
            {level === "complete" ? <Check aria-hidden="true" strokeWidth={2.25} className="size-4 text-progress-complete" /> : null}
            {PROGRESS_LEVEL_LABEL[level].replace(/^./, (c) => c.toUpperCase())}
          </span>
        ) : null}
      </div>
      <Progress
        aria-label={label}
        aria-valuetext={text}
        value={width}
        className="h-3"
        indicatorClassName={cn("animate-bar", level ? PROGRESS_FILL[level] : "bg-progress-mid")}
      />
    </div>
  );
}
