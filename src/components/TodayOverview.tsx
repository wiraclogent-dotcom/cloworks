import { CircleCheckBig, Clock, Inbox, TriangleAlert } from "lucide-react";
import { greetingFor, summarySentence, type TodayOverview as Overview } from "@/lib/todayOverview";
import { KpiTile } from "./ui/KpiTile";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });

/**
 * Welcome card and today's numbers above the board. Server-rendered: the greeting and date are computed for
 * Jakarta, so they do not depend on the viewer's machine.
 */
export function TodayOverview({ name, now, overview }: { name: string; now: Date; overview: Overview }) {
  const firstName = name.trim().split(/\s+/)[0] ?? "";
  return (
    <section aria-label="Today" className="mb-4 grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="flex min-w-0 flex-col justify-center rounded-xl border border-border bg-card p-5 text-card-foreground shadow-card">
        <p className="text-[13px] text-foreground-secondary">{DATE_FORMAT.format(now)}</p>
        <h2 className="mt-1 text-2xl leading-8 font-semibold text-heading">{greetingFor(now)}{firstName ? `, ${firstName}` : ""}</h2>
        <p className="mt-1 text-sm text-foreground-secondary">{summarySentence(overview)}</p>
      </div>
      <ul className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <li className="min-w-0"><KpiTile icon={<Inbox aria-hidden="true" />} label="Open requests" value={overview.open} className="h-full" /></li>
        <li className="min-w-0"><KpiTile icon={<Clock aria-hidden="true" />} label="Due today" value={overview.dueToday} className="h-full" /></li>
        <li className="min-w-0"><KpiTile icon={<TriangleAlert aria-hidden="true" />} label="Overdue" value={overview.overdue} className="h-full" /></li>
        <li className="min-w-0"><KpiTile icon={<CircleCheckBig aria-hidden="true" />} label="Done today" value={overview.doneToday} className="h-full" /></li>
      </ul>
    </section>
  );
}
