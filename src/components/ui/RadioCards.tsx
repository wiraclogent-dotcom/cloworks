import type { ChangeEvent, ReactNode } from "react";
import { cn } from "./cn";

export type RadioCardOption = { value: string; title: string; description?: string; icon?: ReactNode };

/**
 * Radio group rendered as cards. Each card is a <label> around a real <input type="radio"> (keyboard: Tab into the
 * group, arrow keys move, Space selects; works in plain HTML forms). Use `defaultValue` (uncontrolled) or `value` + `onChange`.
 */
export function RadioCards({ name, legend, options, value, defaultValue, onChange, required, invalid, describedBy, hint, hintId, columns = 2, className }: {
  name: string; legend: ReactNode; options: RadioCardOption[];
  value?: string; defaultValue?: string; onChange?: (value: string, e: ChangeEvent<HTMLInputElement>) => void;
  required?: boolean; invalid?: boolean; describedBy?: string;
  /** Helper text rendered inside the fieldset under the cards; linked with aria-describedby (id: `hintId`, default `${name}-help`). */
  hint?: ReactNode; hintId?: string;
  columns?: 1 | 2 | 3; className?: string;
}) {
  const hid = hint ? hintId ?? `${name}-help` : undefined;
  const groupDescribedBy = [describedBy, hid].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset aria-describedby={groupDescribedBy} className={cn("min-w-0", className)}>
      <legend className="mb-1.5 text-[13px] font-medium text-foreground">{legend}</legend>
      <div className={cn("grid gap-3", columns === 1 ? "grid-cols-1" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {options.map((o) => (
          <label key={o.value}
            className={cn(
              "relative flex cursor-pointer items-start gap-3 rounded-xl border bg-surface p-3 transition-colors duration-150 ease-out",
              "hover:border-foreground-secondary has-[:checked]:border-ring has-[:checked]:bg-accent",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              invalid ? "border-danger" : "border-border-strong",
            )}>
            {o.icon ? (
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground-secondary [&_svg]:size-[18px]">{o.icon}</span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span id={`${name}-${o.value}-title`} className="block text-sm font-medium text-foreground">{o.title}</span>
              {o.description ? <span id={`${name}-${o.value}-desc`} className="mt-0.5 block text-[13px] text-foreground-secondary">{o.description}</span> : null}
            </span>
            {/* Named by the card title only; the description is announced as its description. */}
            <input type="radio" name={name} value={o.value} required={required}
              aria-labelledby={`${name}-${o.value}-title`} aria-describedby={o.description ? `${name}-${o.value}-desc` : undefined}
              {...(value !== undefined ? { checked: value === o.value } : { defaultChecked: defaultValue === o.value })}
              onChange={onChange ? (e) => onChange(o.value, e) : value !== undefined ? () => {} : undefined}
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[var(--ring)] focus-visible:outline-none" />
          </label>
        ))}
      </div>
      {hint ? <p id={hid} className="mt-2 text-xs text-foreground-secondary">{hint}</p> : null}
    </fieldset>
  );
}
