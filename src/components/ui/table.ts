import { cn } from "./cn";

/**
 * Table class helpers (monday-style: hairlines, no zebra, row hover, sticky header).
 * const t = tableClass({ compact: true });
 * <div className={t.wrapper}><table className={t.table}><thead className={t.thead}><tr><th className={t.th}>…
 * <tbody><tr className={t.tr}><td className={t.td}>…
 * The header sticks to the top of `wrapper`; give the wrapper a max-height (e.g. "max-h-[70dvh]") for long tables.
 */
export function tableClass({ compact = false, minWidth }: { compact?: boolean; minWidth?: string } = {}) {
  const pad = compact ? "px-3 py-1.5" : "px-3 py-2.5";
  return {
    wrapper: "relative overflow-auto rounded-xl border border-border bg-card shadow-card",
    table: cn("w-full border-collapse text-left text-[13px] text-foreground", minWidth),
    thead: "",
    th: cn("sticky top-0 z-10 border-b border-border bg-surface-muted font-semibold whitespace-nowrap text-foreground-secondary text-xs", pad),
    tr: "border-t border-border first:border-t-0 transition-colors duration-150 hover:bg-surface-muted/60",
    td: cn("align-middle", pad),
    /** Row header cell (the row's title). */
    rowHeader: cn("align-middle font-medium", pad),
    numeric: "text-right tabular-nums",
  };
}
