import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireScope } from "@/lib/session";
import { monthLabel } from "@/lib/kpi/months";
import { jakartaDate } from "@/lib/createRequest";
import { shiftMonth } from "@/lib/calendar";
import { loadMarketingMonth } from "@/lib/marketing/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/shadcn/button";
import { AddActivityButton } from "@/components/marketing/AddActivityButton";
import { MonthBand } from "@/components/marketing/MonthBand";
import { MarketingCalendar } from "@/components/marketing/MarketingCalendar";
import { MarketingSheetProvider } from "@/components/marketing/sheetState";
import { parseMonthParam, type RawParam } from "../dashboard/params";

/** Marketing Calendar body (spec 2026-10-19). Lives outside page.tsx so tests can render it without the Suspense shell. */
export async function MarketingContent({ searchParams }: { searchParams: Promise<Record<string, RawParam>> }) {
  const { user: viewer, db } = await requireScope();
  const now = new Date();
  const month = parseMonthParam((await searchParams).month, now);
  const data = await loadMarketingMonth(db, { id: viewer.id, appRole: viewer.appRole }, month, jakartaDate(now));
  return (
    <MarketingSheetProvider data={data}>
      <PageHeader breadcrumb={[{ label: "Work" }, { label: "Marketing Calendar" }]} title={monthLabel(month)}
        actions={
          <>
            <nav aria-label="Month" className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm" className="px-2">
                <Link href={`/marketing?month=${shiftMonth(month, -1)}`} aria-label="Previous month" title="Previous month"><ChevronLeft aria-hidden="true" strokeWidth={1.75} className="size-4" /></Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="px-2">
                <Link href={`/marketing?month=${shiftMonth(month, 1)}`} aria-label="Next month" title="Next month"><ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4" /></Link>
              </Button>
              <Button asChild variant="outline" size="sm"><Link href="/marketing">Today</Link></Button>
            </nav>
            {data.editableDivisionIds.length > 0 ? <AddActivityButton /> : null}
          </>
        } />
      <MonthBand data={data} />
      <MarketingCalendar data={data} />
    </MarketingSheetProvider>
  );
}
