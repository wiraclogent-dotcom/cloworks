import { Check } from "lucide-react";
import { progressPercent } from "@/lib/kpi/format";
import { PROGRESS_LEVEL_LABEL, progressLevel, type ProgressLevel } from "@/lib/kpi/presentation";
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
 * The fill colour follows the thresholds (< 50 amber, 50–99 Aqua, ≥ 100 green + check); the text always carries the value.
 */
export function ProgressBar({ done, target, progress, label }: { done: number; target: number | null; progress: number | null; label: string }) {
  if (target === null) {
    return <p className="text-sm text-foreground-secondary">{done} {done === 1 ? "task" : "tasks"} done. No target set for this month.</p>;
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
          <span className="inline-flex items-center gap-1 text-[13px] text-foreground-secondary">
            {level === "complete" ? <Check aria-hidden="true" strokeWidth={2.25} className="size-4 text-progress-complete" /> : null}
            {PROGRESS_LEVEL_LABEL[level].replace(/^./, (c) => c.toUpperCase())}
          </span>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width}
        aria-valuetext={text}
        className="h-3 w-full overflow-hidden rounded-full bg-surface-muted outline outline-1 -outline-offset-1 outline-border"
      >
        <div className={cn("h-full rounded-full transition-[width] duration-200 ease-out", level ? PROGRESS_FILL[level] : "bg-progress-mid")} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
