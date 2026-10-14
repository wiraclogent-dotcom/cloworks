import Link from "next/link";
import { ArrowUpRight, CircleCheckBig, Clock, Inbox, Moon, Sun, Sunrise, TriangleAlert } from "lucide-react";
import { SCOPE_LABEL, dayPeriodFor, greetingFor, summarySentence, type DayPeriod, type TodayOverview as Overview } from "@/lib/todayOverview";
import { WelcomeIllustration } from "./WelcomeIllustration";
import { cn, focusRing } from "./ui/cn";
import { CountUp } from "./ui/CountUp";

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric" });

const PERIOD_ICON: Record<DayPeriod, React.ReactNode> = { morning: <Sunrise />, afternoon: <Sun />, evening: <Moon /> };

/** One number that opens the list it counts. `emphasis` colours the number only when there is something to act on. */
/** `tone` tints the icon tile with that status colour; `i` staggers the tiles' entrance. */
function Tile({ href, icon, label, value, emphasis, tone, i }: { href: string; icon: React.ReactNode; label: string; value: number; emphasis?: string; tone: string; i: number }) {
  return (
    <Link href={href} style={{ "--i": i } as React.CSSProperties} className={cn("lift animate-rise group relative flex w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-card transition-colors duration-150 hover:border-border-strong", focusRing)}>
      <span aria-hidden="true" data-tone={tone} className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tone-tint text-tone-text [&_svg]:size-[18px]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-display text-2xl leading-7 font-bold tabular-nums text-foreground", value > 0 && emphasis)}><CountUp value={value} /></span>
        {/* Wraps rather than truncates: two-column tiles on a phone cut "Open requests" to "Open requ…". */}
        <span className="block text-compact leading-5 text-pretty text-muted-foreground">{label}</span>
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
  const period = dayPeriodFor(now);
  return (
    <section aria-label="Today" className="mb-4 grid min-w-0 gap-3">
      <div className="animate-rise relative flex min-w-0 items-center gap-6 overflow-hidden rounded-xl border border-border bg-card p-5 text-card-foreground shadow-card">
        {/* Soft Aqua wash from the illustration side */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_100%_50%,var(--accent),transparent_70%)] opacity-60" />
        <div className="relative min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-compact text-muted-foreground">
            <span aria-hidden="true" className="text-[var(--status-due-soon-accent)] [&_svg]:size-4">{PERIOD_ICON[period]}</span>
            {DATE_FORMAT.format(now)}
          </p>
          <h2 className="mt-1 font-display text-2xl leading-8 font-bold tracking-[-0.01em] text-heading">{greetingFor(now)}{firstName ? `, ${firstName}` : ""}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{summarySentence(overview)}</p>
        </div>
        <div className="relative hidden h-[7.5rem] w-[234px] shrink-0 sm:block">
          <WelcomeIllustration period={period} />
        </div>
      </div>
      <ul className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Each tile opens exactly the requests it counts (?scope=, same definition as the count), most urgent first. */}
        <li className="flex min-w-0"><Tile href="/requests?view=table&scope=open&sort=deadline" icon={<Inbox aria-hidden="true" />} label={SCOPE_LABEL.open} value={overview.open} tone="in-progress" i={0} /></li>
        <li className="flex min-w-0"><Tile href="/requests?view=table&scope=due-today&sort=deadline" icon={<Clock aria-hidden="true" />} label={SCOPE_LABEL["due-today"]} value={overview.dueToday} emphasis="text-[var(--status-due-soon-accent)]" tone="due-soon" i={1} /></li>
        <li className="flex min-w-0"><Tile href="/requests?view=table&scope=overdue&sort=deadline" icon={<TriangleAlert aria-hidden="true" />} label={SCOPE_LABEL.overdue} value={overview.overdue} emphasis="text-danger" tone="overdue" i={2} /></li>
        <li className="flex min-w-0"><Tile href="/requests?view=table&scope=done-today" icon={<CircleCheckBig aria-hidden="true" />} label={SCOPE_LABEL["done-today"]} value={overview.doneToday} tone="done" i={3} /></li>
      </ul>
    </section>
  );
}
