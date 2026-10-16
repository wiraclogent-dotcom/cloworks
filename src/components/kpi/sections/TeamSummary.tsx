import type { ScopedDb } from "@/lib/db";
import { teamProjectsData, teamRequestsData } from "@/lib/kpi/pageData";
import { teamSummaryCells } from "@/lib/kpi/summary";
import { SummaryStrip } from "@/components/kpi/SummaryStrip";

/** Team KPI summary under the page header: both rosters, following the month and year pickers. Streams on its own. */
export async function TeamSummary({ db, month, year }: { db: ScopedDb; month: string; year: number }) {
  const [{ rows }, { kpis }] = await Promise.all([teamRequestsData(db, month), teamProjectsData(db, year)]);
  return <SummaryStrip cells={teamSummaryCells({ month, year, requestRows: rows, projectKpis: kpis })} />;
}
