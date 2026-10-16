import { CalendarCheck, CircleCheckBig, Gauge, ListChecks, Users } from "lucide-react";
import type { SummaryCell } from "@/lib/kpi/summary";
import { cn } from "@/components/ui/cn";
import { StatCard } from "@/components/ui/StatCard";

const ICON: Record<SummaryCell["key"], React.ReactNode> = {
  people: <Users />, reqDone: <CircleCheckBig />, reqProgress: <Gauge />, projDone: <ListChecks />, projOnTime: <CalendarCheck />,
};

/**
 * The page summary under the header (V3): one card per number, the first solid blue. Phones: two columns, the last
 * odd card spans the row. Five cards (Team KPI) use six columns from md, grouped by section: People + the two Request
 * cards (2 each), then the two Project cards (3 each). Four cards (My KPI) sit in one row from md. No width leaves an
 * empty cell.
 */
const FIVE_SPAN = ["md:col-span-2", "md:col-span-2", "md:col-span-2", "md:col-span-3", "col-span-2 md:col-span-3"];

export function SummaryStrip({ cells }: { cells: SummaryCell[] }) {
  const five = cells.length === 5;
  return (
    <section aria-labelledby="kpi-summary-title">
      <h2 id="kpi-summary-title" className="sr-only">Summary</h2>
      <ul className={cn("grid grid-cols-2 gap-3", five ? "md:grid-cols-6" : "md:grid-cols-4")}>
        {cells.map((c, i) => (
          <StatCard key={c.key} data-kpi={c.key} icon={ICON[c.key]} label={c.label} value={c.value} hint={c.hint} solid={i === 0}
            className={cn(five && FIVE_SPAN[i], !five && i === cells.length - 1 && cells.length % 2 === 1 && "col-span-2 md:col-span-1")} />
        ))}
      </ul>
    </section>
  );
}
