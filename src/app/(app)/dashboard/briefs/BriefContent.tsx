import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { jakartaMonth, monthLabel } from "@/lib/kpi/months";
import { jakartaDate } from "@/lib/createRequest";
import { buildBriefMonth } from "@/lib/briefCalendar";
import { loadBriefItems } from "@/lib/briefCalendarQueries";
import { MonthPicker } from "@/components/kpi/MonthPicker";
import { BriefCalendar } from "@/components/briefs/BriefCalendar";
import { AccessDenied } from "@/components/AccessDenied";
import { PageHeader } from "@/components/ui/PageHeader";
import { parseMonthParam, type RawParam } from "../params";

/** Brief calendar body (spec 2026-10-10). Lives outside page.tsx so tests can render it without the Suspense shell. */
export async function BriefContent({ searchParams }: { searchParams: Promise<Record<string, RawParam>> }) {
  const { user: viewer, db } = await requireScope();
  if (!can(viewer.appRole, "dashboard.team")) {
    return <AccessDenied description="The brief calendar is only available to leads and admins." backHref="/dashboard" backLabel="Back to My KPI" />;
  }
  const month = parseMonthParam((await searchParams).month);
  const now = new Date();
  const model = buildBriefMonth(month, jakartaDate(now), await loadBriefItems(db, month));
  return (
    <>
      <PageHeader breadcrumb={[{ label: "Work" }, { label: "Brief Calendar" }]} title="Brief Calendar" description={monthLabel(month)}
        actions={<MonthPicker month={month} current={jakartaMonth(now)} action="/dashboard/briefs" />} />
      <BriefCalendar model={model} />
    </>
  );
}
