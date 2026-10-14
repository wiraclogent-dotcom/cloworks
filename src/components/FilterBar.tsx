import Link from "next/link";
import type { RequestStatus } from "@prisma/client";
import { Brush, Check, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { SCOPE_LABEL } from "@/lib/todayOverview";
import type { ViewParams } from "@/app/(app)/requests/params";
import { STATUS_LABEL } from "./status";
import { buttonClass } from "./ui/Button";
import { cn, focusRing } from "./ui/cn";
import { SEGMENT_TRAY, segmentClass } from "./ui/SegmentedControl";

type Opt = { id: string; name: string };

/** Pill-style field: 32px, full radius, 3:1 outline, Aqua focus ring; an active filter gets the Aqua tint. */
const pill = (active = false) => cn(
  "h-8 rounded-full border text-[13px] transition-colors duration-150 ease-out hover:border-muted-foreground",
  active ? "border-ring bg-accent text-accent-foreground" : "border-input bg-card text-foreground",
  focusRing,
);
/**
 * Toolbar field (search, Filters): the same 40px muted, rounded-xl surface as the view switcher's tray, so the whole
 * toolbar row reads as one set. `active` raises it like a selected segment.
 */
const toolbarField = (active = false) => cn(
  "h-10 rounded-xl text-[13px] font-medium transition-colors duration-150 ease-out",
  active ? "bg-card text-foreground shadow-card ring-1 ring-ring" : "bg-muted text-muted-foreground hover:text-foreground",
  focusRing,
);

/** "My requests" / "My work": a segment that toggles its URL flag, raised with a check while on. */
function Toggle({ href, on, icon, children }: { href: string; on: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={on ? "true" : undefined} className={segmentClass(on)}>
      {on ? <Check aria-hidden="true" strokeWidth={2} data-icon="check" /> : icon}
      {children}
    </Link>
  );
}

/** Label stacked above a control inside the Filters panel. */
const LABEL = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";

/**
 * Plain GET form: works without JS and keeps the URL shareable. One toolbar row: the search box and a Filters
 * button, with the My requests / My work quick filters in front; the dropdowns, Apply and Clear live in the Filters panel (a native <details>, so it opens
 * without JS and its fields are still submitted when it is closed).
 */
export function FilterBar({ p, brands, divisions, assignees, mineHref, workHref, scopeClearHref, clearHref }: {
  p: ViewParams; brands: Opt[]; divisions: Opt[]; assignees: Opt[]; mineHref: string;
  /** Designers only: toggles "My work" (requests assigned to me). */
  workHref?: string;
  /** Set while a summary tile's list is shown (?scope=): removes just that. */
  scopeClearHref?: string;
  clearHref: string;
}) {
  const all = Object.keys(STATUS_LABEL) as RequestStatus[];
  /** The calendar and timeline only show open work, so closed statuses are not offered there. */
  const statuses = p.view === "calendar" || p.view === "timeline" ? all.filter((s) => s !== "DONE" && s !== "CANCELLED") : all;
  const activeCount = [p.status, p.brandId, p.divisionId, p.assigneeId, p.motion].filter(Boolean).length;
  const select = (name: string, label: string, value: string | undefined, opts: Opt[]) => (
    <label className={LABEL}>
      {label}
      <select name={name} defaultValue={value ?? ""} className={cn(pill(!!value), "w-full pr-7 pl-3")}>
        <option value="">All</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
  return (
    // Keyed on the filters: Clear filters / My requests are soft navigations that reuse this form, and uncontrolled
    // fields ignore a new defaultValue, so a remount is what shows the new values (and closes the panel).
    <form key={JSON.stringify([p.q, p.status, p.brandId, p.divisionId, p.assigneeId, p.motion, p.mine, p.work, p.scope, p.view])} method="get" action="/requests" role="search" aria-label="Filter requests" className="flex flex-wrap items-center gap-2">
      {p.view !== "board" && <input type="hidden" name="view" value={p.view} />}
      {p.view === "calendar" && <input type="hidden" name="month" value={p.month} />}
      {p.view === "timeline" && <input type="hidden" name="week" value={p.week} />}
      {p.mine && <input type="hidden" name="mine" value="1" />}
      {p.work && <input type="hidden" name="work" value="1" />}
      {p.scope && <input type="hidden" name="scope" value={p.scope} />}
      {/* Keep the table sort when filtering (same rules as hrefWith: the default, newest requested first, is not repeated). */}
      {p.view === "table" && !(p.sort === "requested" && p.dir === "desc") && <input type="hidden" name="sort" value={p.sort} />}
      {p.view === "table" && !(p.sort === "requested" && p.dir === "desc") && <input type="hidden" name="dir" value={p.dir} />}
      {p.scope && scopeClearHref && (
        <div className={SEGMENT_TRAY}>
          <Link href={scopeClearHref} className={segmentClass(true)} aria-label={`Showing ${SCOPE_LABEL[p.scope]}. Show all requests`}>
            {SCOPE_LABEL[p.scope]}<X aria-hidden="true" strokeWidth={1.75} />
          </Link>
        </div>
      )}
      {/* Quick scopes sit in the toolbar, not the panel: one click, and visible while on. */}
      <div role="group" aria-label="Quick filters" className={SEGMENT_TRAY}>
        <Toggle href={mineHref} on={p.mine} icon={<UserRound aria-hidden="true" strokeWidth={1.75} />}>My requests</Toggle>
        {workHref && <Toggle href={workHref} on={p.work} icon={<Brush aria-hidden="true" strokeWidth={1.75} />}>My work</Toggle>}
      </div>
      <label className="relative block">
        <span className="sr-only">Search</span>
        <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input type="search" name="q" maxLength={200} defaultValue={p.q ?? ""} placeholder="Title or notes" className={cn(toolbarField(!!p.q), "w-56 pr-3 pl-9 font-normal text-foreground placeholder:text-placeholder")} />
      </label>
      <details className="group relative">
        <summary className={cn(toolbarField(activeCount > 0), "flex cursor-pointer list-none items-center gap-1.5 px-3 [&::-webkit-details-marker]:hidden")}>
          <SlidersHorizontal aria-hidden="true" strokeWidth={1.75} className="size-4" />
          Filters{activeCount > 0 ? <span className="tabular-nums">· {activeCount}</span> : null}
        </summary>
        <div className="absolute right-0 z-20 mt-2 flex w-72 flex-col gap-3 rounded-xl border border-border bg-popover p-4 text-card-foreground shadow-raised">
          {select("status", "Status", p.status, statuses.map((s) => ({ id: s, name: STATUS_LABEL[s] })))}
          {select("brand", "Brand", p.brandId, brands)}
          {select("division", "Division", p.divisionId, divisions)}
          {/* "My work" already fixes the assignee to me. */}
          {!p.work && select("assignee", "Assignee", p.assigneeId, assignees)}
          <label className={LABEL}>
            Motion
            <select name="motion" defaultValue={p.motion ?? ""} className={cn(pill(!!p.motion), "w-full pr-7 pl-3")}>
              <option value="">Any</option>
              <option value="yes">Needs motion</option>
              <option value="no">No motion</option>
            </select>
          </label>
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <button type="submit" className={buttonClass({ variant: "primary", size: "sm" })}>Apply</button>
            <Link href={clearHref} className={buttonClass({ variant: "ghost", size: "sm" })}><X aria-hidden="true" strokeWidth={1.75} />Clear filters</Link>
          </div>
        </div>
      </details>
    </form>
  );
}
