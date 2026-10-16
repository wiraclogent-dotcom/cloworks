import type { JobRole } from "@prisma/client";
import type { ScopedDb } from "@/lib/db";
import { myRequestsData, personProjectKpi } from "@/lib/kpi/pageData";
import { personSummaryCells } from "@/lib/kpi/summary";
import { SummaryStrip } from "@/components/kpi/SummaryStrip";

/** My KPI summary under the page header: the person's request and project numbers (no People card). */
export async function MySummary({ db, subject, month, year }: { db: ScopedDb; subject: { id: string; jobRole: JobRole }; month: string; year: number }) {
  const [req, project] = await Promise.all([myRequestsData(db, subject.id, subject.jobRole, month), personProjectKpi(db, subject.id, year)]);
  return <SummaryStrip cells={personSummaryCells({ month, year, request: req.isEmpty ? null : req.kpi, project })} />;
}
