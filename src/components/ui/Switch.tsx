import type { ChangeEvent, ReactNode } from "react";
import { cn } from "./cn";

/**
 * On/off switch built on a real checkbox (role="switch"), so labels, forms and tests keep working:
 * `<Switch id="kpi" label="Counts toward KPI" checked={on} onChange={(e) => set(e.target.checked)} />`.
 * The whole row is the <label>; the track shows Deep Blue (Aqua in dark) when on, the focus ring follows the input.
 */
export function Switch({ id, label, description, checked, disabled, onChange, describedBy, className }: {
  id: string; label: ReactNode; description?: ReactNode; checked: boolean; disabled?: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void; describedBy?: string; className?: string;
}) {
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-center justify-between gap-3 text-sm", disabled && "cursor-not-allowed opacity-70", className)}>
      <span className="min-w-0">
        <span className="block font-medium text-foreground">{label}</span>
        {description ? <span className="block text-xs text-foreground-secondary">{description}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={onChange} aria-describedby={describedBy}
          className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed" />
        <span aria-hidden="true" data-switch-track=""
          className={cn(
            "pointer-events-none inline-flex h-5 w-9 items-center rounded-full bg-input p-0.5 transition-colors duration-150 ease-out",
            "peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
            "peer-checked:[&>span]:translate-x-4",
          )}>
          <span className="size-4 rounded-full bg-surface shadow-card transition-transform duration-150 ease-out" />
        </span>
      </span>
    </label>
  );
}
