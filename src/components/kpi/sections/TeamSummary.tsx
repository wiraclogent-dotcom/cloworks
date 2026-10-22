import type { ScopedDb } from "@/lib/db";
import { teamProjectsData, teamRequestsData } from "@/lib/kpi/pageData";
import { teamSummaryCells } from "@/lib/kpi/summary";
import { SummaryStrip } from "@/components/kpi/SummaryStrip";
import { measureOfTeam, type KpiTeam } from "@/lib/kpi/team";

/** Team KPI summary under the page header: both rosters of `team`, following the month and year pickers. Streams on its own. */
export async function TeamSummary({ db, month, year, team = "creative" }: { db: ScopedDb; month: string; year: number; team?: KpiTeam }) {
  const [{ rows }, { kpis }] = await Promise.all([teamRequestsData(db, month, team), teamProjectsData(db, year, team)]);
  return <SummaryStrip cells={teamSummaryCells({ month, year, requestRows: rows, projectKpis: kpis, measure: measureOfTeam(team) })} />;
}
