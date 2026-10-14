import type { ReactNode } from "react";
import { RadioGroup, RadioGroupItem } from "@/components/shadcn/radio-group";
import { cn } from "./cn";

export type RadioCardOption = { value: string; title: string; description?: string; icon?: ReactNode };

/**
 * Radio group rendered as cards: a shadcn `RadioGroup` (role="radiogroup", named by `legend`) whose items sit inside
 * <label> cards, so the whole card is clickable. Keyboard: Tab into the group, arrow keys move and choose.
 * In a plain <form> the chosen card posts `name=value` (nothing until one is chosen).
 * Use `defaultValue` (uncontrolled) or `value` + `onChange`.
 */
export function RadioCards({ name, legend, options, value, defaultValue, onChange, required, invalid, describedBy, hint, hintId, columns = 2, className }: {
  name: string; legend: ReactNode; options: RadioCardOption[];
  value?: string; defaultValue?: string; onChange?: (value: string) => void;
  required?: boolean; invalid?: boolean; describedBy?: string;
  /** Helper text rendered under the cards; linked with aria-describedby (id: `hintId`, default `${name}-help`). */
  hint?: ReactNode; hintId?: string;
  columns?: 1 | 2 | 3; className?: string;
}) {
  const hid = hint ? hintId ?? `${name}-help` : undefined;
  const groupDescribedBy = [describedBy, hid].filter(Boolean).join(" ") || undefined;
  const legendId = `${name}-legend`;
  return (
    <div className={cn("min-w-0", className)}>
      <div id={legendId} className="mb-1.5 text-compact font-medium text-foreground">{legend}</div>
      <RadioGroup name={name} value={value} defaultValue={defaultValue} onValueChange={onChange} required={required}
        aria-labelledby={legendId} aria-describedby={groupDescribedBy} aria-invalid={invalid || undefined}
        className={cn(columns === 1 ? "grid-cols-1" : columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {options.map((o) => (
          <label key={o.value}
            className={cn(
              "relative flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 transition-colors duration-150 ease-out",
              "hover:border-muted-foreground has-[[data-state=checked]]:border-ring has-[[data-state=checked]]:bg-accent",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              invalid ? "border-danger" : "border-border-strong",
            )}>
            {o.icon ? (
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-[18px]">{o.icon}</span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span id={`${name}-${o.value}-title`} className="block text-sm font-medium text-foreground">{o.title}</span>
              {o.description ? <span id={`${name}-${o.value}-desc`} className="mt-0.5 block text-compact text-muted-foreground">{o.description}</span> : null}
            </span>
            {/* Named by the card title only; the description is announced as its description. */}
            <RadioGroupItem value={o.value} className="mt-0.5 focus-visible:outline-0"
              aria-labelledby={`${name}-${o.value}-title`} aria-describedby={o.description ? `${name}-${o.value}-desc` : undefined} />
          </label>
        ))}
      </RadioGroup>
      {hint ? <p id={hid} className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
