import { Check } from "lucide-react";

/**
 * 8px rounded track with an Aqua fill. The bar is clamped at 100%, the text and aria-valuetext carry the real value;
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
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
          <span className="font-medium text-foreground">{label}</span>
          <span className="inline-flex items-center gap-1 text-foreground-secondary tabular-nums">
            {complete ? <Check aria-hidden="true" strokeWidth={2} className="size-3.5 text-link" /> : null}
            {text}
          </span>
        </div>
      ) : null}
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(safe, max)} aria-valuetext={text}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-muted outline outline-1 -outline-offset-1 outline-border">
        <div className="h-full rounded-full bg-chart-done transition-[width] duration-200 ease-out" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
