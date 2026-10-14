import { Check } from "lucide-react";
import { Progress } from "@/components/shadcn/progress";

/**
 * 8px rounded track (shadcn Progress) with an Aqua fill. The bar is clamped at 100%, the text and aria-valuetext carry the real value;
 * at or above 100% a check is shown. `label` is the accessible name (shown above the bar unless `hideLabel`).
 */
export function ProgressBar({ value, max = 100, label, hideLabel = false, valueText, className }: {
  value: number; max?: number; label: string; hideLabel?: boolean; valueText?: string; className?: string;
}) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const pct = max > 0 ? Math.round((safe / max) * 100) : 0;
  const complete = pct >= 100;
  const text = valueText ?? `${pct}%`;
  return (
    <div className={className}>
      {!hideLabel ? (
        <div className="mb-1.5 flex items-center justify-between gap-2 text-compact">
          <span className="font-medium text-foreground">{label}</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground tabular-nums">
            {complete ? <Check aria-hidden="true" strokeWidth={2} className="size-3.5 text-link" /> : null}
            {text}
          </span>
        </div>
      ) : null}
      <Progress aria-label={label} aria-valuetext={text} value={Math.min(safe, max)} max={max > 0 ? max : 100} indicatorClassName="animate-bar bg-chart-done" />
    </div>
  );
}
