import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn, focusRing } from "./cn";

/**
 * Input / select / textarea styles: 36px, 8px radius, 3:1 outline, Aqua focus ring (2px + 2px offset).
 * `<input className={fieldClass()} />`, `<select className={fieldClass({ kind: "select" })}>`,
 * `<textarea className={fieldClass({ kind: "textarea" })} />`. Pass `invalid` together with aria-invalid and a <FieldError>.
 */
export function fieldClass({ kind = "input", invalid = false, size = "md", className }: {
  kind?: "input" | "select" | "textarea"; invalid?: boolean; size?: "sm" | "md"; className?: string;
} = {}): string {
  return cn(
    "block w-full rounded-lg border bg-surface text-sm text-foreground placeholder:text-foreground-muted",
    "transition-colors duration-150 ease-out hover:border-foreground-secondary disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70",
    invalid ? "border-danger" : "border-input",
    kind === "textarea" ? "min-h-24 px-3 py-2" : size === "sm" ? "h-8 px-2.5" : "h-9 px-3",
    kind === "select" && "pr-8",
    focusRing, className,
  );
}

/** Field label: 13px/500. */
export const labelClass = "mb-1.5 block text-[13px] font-medium text-foreground";
/** Helper text under a field. */
export const hintClass = "mt-1.5 text-xs text-foreground-secondary";

/** Inline error under a field: icon + message, linked with aria-describedby={id}. Renders nothing without children. */
export function FieldError({ id, children, className }: { id: string; children?: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p id={id} className={cn("mt-1.5 flex items-start gap-1.5 text-[13px] text-danger", className)}>
      <CircleAlert aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
