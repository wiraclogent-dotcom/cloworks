import type { ReactNode } from "react";
import { Switch as SwitchControl } from "@/components/shadcn/switch";
import { cn } from "./cn";

/**
 * On/off switch row: a shadcn `Switch` (role="switch") inside a <label> that spans the row, so the label and the
 * description are both click targets: `<Switch id="kpi" label="Counts toward KPI" checked={on} onCheckedChange={set} />`.
 * The label text names the switch; the description (and `describedBy`, e.g. an error line) describe it.
 * With a `name` it posts `name=on` when on and nothing when off inside a plain <form>.
 */
export function Switch({ id, label, description, checked, disabled, onCheckedChange, describedBy, name, className }: {
  id: string; label: ReactNode; description?: ReactNode; checked: boolean; disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void; describedBy?: string; name?: string; className?: string;
}) {
  const labelId = `${id}-label`;
  const descId = description ? `${id}-desc` : undefined;
  const describedByIds = [descId, describedBy].filter(Boolean).join(" ") || undefined;
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-center justify-between gap-3 text-sm", disabled && "cursor-not-allowed opacity-70", className)}>
      <span className="min-w-0">
        <span id={labelId} className="block font-medium text-foreground">{label}</span>
        {description ? <span id={descId} className="block text-xs text-muted-foreground">{description}</span> : null}
      </span>
      <SwitchControl id={id} name={name} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange}
        aria-labelledby={labelId} aria-describedby={describedByIds} />
    </label>
  );
}
