import Link from "next/link";
import { ArrowUpRight, CircleCheckBig, Clock, Inbox, TriangleAlert } from "lucide-react";
import { greetingFor, summarySentence, type TodayOverview as Overview } from "@/lib/todayOverview";
import { cn, focusRing } from "./ui/cn";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** One number that opens the list it counts. `emphasis` colours the number only when there is something to act on. */
function Tile({ href, icon, label, value, emphasis }: { href: string; icon: React.ReactNode; label: string; value: number; emphasis?: string }) {
  return (
    <Link href={href} className={cn("group relative flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-card transition-colors duration-150 hover:border-border-strong", focusRing)}>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground [&_svg]:size-[18px]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-2xl leading-7 font-semibold tabular-nums text-foreground", value > 0 && emphasis)}>{value}</span>
        <span title={label} className="block truncate text-[13px] leading-5 whitespace-nowrap text-foreground-secondary">{label}</span>
      </span>
      <ArrowUpRight aria-hidden="true" className="absolute top-3 right-3 size-3.5 text-foreground-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
    </Link>
  );
}

/**
 * Welcome card across the full width, today's numbers in a row below it, above the board. Server-rendered: the
 * greeting and date are computed for Jakarta, so they do not depend on the viewer's machine. Each number links to the
 * list it counts.
 */
export function TodayOverview({ name, now, overview }: { name: string; now: Date; overview: Overview }) {
  const firstName = name.trim().split(/\s+/)[0] ?? "";
  return (
    <section aria-label="Today" className="mb-4 grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-col justify-center rounded-xl border border-border bg-card p-5 text-card-foreground shadow-card">
        <p className="text-[13px] text-foreground-secondary">{DATE_FORMAT.format(now)}</p>
        <h2 className="mt-1 text-2xl leading-8 font-semibold text-heading">{greetingFor(now)}{firstName ? `, ${firstName}` : ""}</h2>
        <p className="mt-1 text-sm text-foreground-secondary">{summarySentence(overview)}</p>
      </div>
      <ul className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <li className="min-w-0"><Tile href="/requests" icon={<Inbox aria-hidden="true" />} label="Open requests" value={overview.open} /></li>
        <li className="min-w-0"><Tile href="/requests?view=table&sort=deadline" icon={<Clock aria-hidden="true" />} label="Due today" value={overview.dueToday} emphasis="text-[var(--status-due-soon-accent)]" /></li>
        <li className="min-w-0"><Tile href="/requests?view=table&sort=deadline" icon={<TriangleAlert aria-hidden="true" />} label="Overdue" value={overview.overdue} emphasis="text-danger" /></li>
        <li className="min-w-0"><Tile href="/requests?view=table&status=DONE" icon={<CircleCheckBig aria-hidden="true" />} label="Done today" value={overview.doneToday} /></li>
      </ul>
    </section>
  );
}
