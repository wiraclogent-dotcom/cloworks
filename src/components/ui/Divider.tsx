import { cn } from "./cn";

/** Hairline separator. With `label`, the text sits centred on the line (e.g. "or"). */
export function Divider({ label, className }: { label?: string; className?: string }) {
  if (!label) return <hr className={cn("border-0 border-t border-border", className)} />;
  return (
    <div role="separator" aria-label={label} className={cn("flex items-center gap-3 text-xs text-foreground-secondary", className)}>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span aria-hidden="true">{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}
