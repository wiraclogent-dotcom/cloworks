import { CalendarCheck, CircleCheckBig, Gauge, ListChecks, Users } from "lucide-react";
import type { SummaryCell } from "@/lib/kpi/summary";
import { cn } from "@/components/ui/cn";

const ICON: Record<SummaryCell["key"], React.ReactNode> = {
  people: <Users />, reqDone: <CircleCheckBig />, reqProgress: <Gauge />, projDone: <ListChecks />, projOnTime: <CalendarCheck />,
};

/**
 * The page summary under the header: one scorecard (hairlines come from the grid gap showing the border colour
 * between cells). Phones: two columns, the last odd card spans the row. Five cards (Team KPI) use six columns from md,
 * grouped by section: People + the two Request cards (2 each), then the two Project cards (3 each). Four cards (My
 * KPI) sit in one row from md. No width leaves an empty cell.
 */
const FIVE_SPAN = ["md:col-span-2", "md:col-span-2", "md:col-span-2", "md:col-span-3", "col-span-2 md:col-span-3"];

export function SummaryStrip({ cells }: { cells: SummaryCell[] }) {
  const five = cells.length === 5;
  return (
    <section aria-labelledby="kpi-summary-title">
      <h2 id="kpi-summary-title" className="sr-only">Summary</h2>
      <ul className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border shadow-card", five ? "md:grid-cols-6" : "md:grid-cols-4")}>
        {cells.map((c, i) => (
          <li key={c.key} data-kpi={c.key} className={cn("flex min-w-0 flex-col gap-2 bg-card p-4", five && FIVE_SPAN[i])}>
            <span className="flex items-center gap-1.5 text-[13px] text-foreground-secondary">
              <span aria-hidden="true" className="text-foreground-muted [&_svg]:size-3.5">{ICON[c.key]}</span>
              {c.label}
            </span>
            <span className="text-2xl leading-8 font-semibold text-foreground tabular-nums">{c.value}</span>
            {c.hint ? <span className="text-xs leading-4 text-foreground-secondary">{c.hint}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
