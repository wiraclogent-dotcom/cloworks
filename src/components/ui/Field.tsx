import { cn, focusRing } from "./cn";

/**
 * Select styles until the shadcn select replaces them (Task 6): 36px, 8px radius, 3:1 outline, Aqua focus ring.
 * `<select className={fieldClass({ kind: "select" })}>`. Inputs and textareas use `Input` / `Textarea`, labels `Label`,
 * hints and errors `FieldDescription` / `FieldError` (src/components/shadcn). Pass `invalid` together with aria-invalid.
 */
export function fieldClass({ kind = "input", invalid = false, size = "md", className }: {
  kind?: "input" | "select" | "textarea"; invalid?: boolean; size?: "sm" | "md"; className?: string;
} = {}): string {
  return cn(
    "block w-full rounded-lg border bg-card text-sm text-foreground placeholder:text-placeholder",
    "transition-colors duration-150 ease-out hover:border-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70",
    invalid ? "border-danger" : "border-input",
    kind === "textarea" ? "min-h-24 px-3 py-2" : size === "sm" ? "h-8 px-2.5" : "h-9 px-3",
    kind === "select" && "pr-8",
    focusRing, className,
  );
}
