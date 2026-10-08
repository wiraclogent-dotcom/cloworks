import { progressPercent } from "@/lib/kpi/format";

/**
 * "X of Y tasks (Z%)" with a progressbar. The visual bar is clamped at 100% but the text and
 * aria-valuenow carry the real percentage. Without a target there is nothing to measure against.
 */
export function ProgressBar({ done, target, progress, label }: { done: number; target: number | null; progress: number | null; label: string }) {
  if (target === null) {
    return <p className="text-sm text-muted-foreground">{done} {done === 1 ? "task" : "tasks"} done. No target set for this month.</p>;
  }
  const pct = progressPercent(progress);
  const text = pct === null ? `${done} of ${target} tasks` : `${done} of ${target} tasks (${pct}%)`;
  const width = Math.min(100, Math.max(0, pct ?? 0));
  return (
    <div>
      <p className="mb-2 text-lg font-semibold">{text}</p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width}
        aria-valuetext={text}
        className="h-3 w-full overflow-hidden rounded-full bg-muted outline outline-1 -outline-offset-1 outline-border"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
