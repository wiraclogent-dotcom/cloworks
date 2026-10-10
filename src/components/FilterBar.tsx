import Link from "next/link";
import type { RequestStatus } from "@prisma/client";
import { Check, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import type { ViewParams } from "@/app/(app)/requests/params";
import { STATUS_LABEL } from "./status";
import { buttonClass } from "./ui/Button";
import { cn, focusRing } from "./ui/cn";

type Opt = { id: string; name: string };

/** Pill-style field: 32px, full radius, 3:1 outline, Aqua focus ring; an active filter gets the Aqua tint. */
const pill = (active = false) => cn(
  "h-8 rounded-full border text-[13px] transition-colors duration-150 ease-out hover:border-foreground-secondary",
  active ? "border-ring bg-accent text-accent-foreground" : "border-input bg-surface text-foreground",
  focusRing,
);
/** Label stacked above a control inside the Filters panel. */
const LABEL = "flex flex-col gap-1 text-xs font-medium text-foreground-secondary";

/**
 * Plain GET form: works without JS and keeps the URL shareable. One toolbar row: the search box and a Filters
 * button; the dropdowns, Apply, My requests and Clear live in the Filters panel (a native <details>, so it opens
 * without JS and its fields are still submitted when it is closed).
 */
export function FilterBar({ p, brands, divisions, assignees, mineHref, clearHref }: {
  p: ViewParams; brands: Opt[]; divisions: Opt[]; assignees: Opt[]; mineHref: string; clearHref: string;
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
    <form key={JSON.stringify([p.q, p.status, p.brandId, p.divisionId, p.assigneeId, p.motion, p.mine, p.view])} method="get" action="/requests" role="search" aria-label="Filter requests" className="flex flex-wrap items-center gap-2">
      {p.view !== "board" && <input type="hidden" name="view" value={p.view} />}
      {p.view === "calendar" && <input type="hidden" name="month" value={p.month} />}
      {p.view === "timeline" && <input type="hidden" name="week" value={p.week} />}
      {p.mine && <input type="hidden" name="mine" value="1" />}
      {/* Keep the table sort when filtering (same rules as hrefWith). */}
      {p.view === "table" && p.sort !== "deadline" && <input type="hidden" name="sort" value={p.sort} />}
      {p.dir === "desc" && <input type="hidden" name="dir" value="desc" />}
      <label className="relative block">
        <span className="sr-only">Search</span>
        <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-foreground-secondary" />
        <input type="search" name="q" maxLength={200} defaultValue={p.q ?? ""} placeholder="Title or notes" className={cn(pill(), "w-56 pr-3 pl-8 placeholder:text-placeholder")} />
      </label>
      <details className="group relative">
        <summary className={cn(pill(activeCount > 0), "flex cursor-pointer list-none items-center gap-1.5 px-3 [&::-webkit-details-marker]:hidden")}>
          <SlidersHorizontal aria-hidden="true" strokeWidth={1.75} className="size-3.5" />
          Filters{activeCount > 0 ? <span className="tabular-nums">· {activeCount}</span> : null}
        </summary>
        <div className="absolute right-0 z-20 mt-2 flex w-72 flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-raised">
          {select("status", "Status", p.status, statuses.map((s) => ({ id: s, name: STATUS_LABEL[s] })))}
          {select("brand", "Brand", p.brandId, brands)}
          {select("division", "Division", p.divisionId, divisions)}
          {select("assignee", "Assignee", p.assigneeId, assignees)}
          <label className={LABEL}>
            Motion
            <select name="motion" defaultValue={p.motion ?? ""} className={cn(pill(!!p.motion), "w-full pr-7 pl-3")}>
              <option value="">Any</option>
              <option value="yes">Needs motion</option>
              <option value="no">No motion</option>
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <button type="submit" className={buttonClass({ variant: "primary", size: "sm" })}>Apply</button>
            <Link href={mineHref} aria-current={p.mine ? "true" : undefined}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150 ease-out",
                p.mine ? "border-ring bg-accent text-accent-foreground" : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
                focusRing,
              )}>
              {p.mine ? <Check aria-hidden="true" strokeWidth={2} data-icon="check" className="size-3.5" /> : <UserRound aria-hidden="true" strokeWidth={1.75} className="size-3.5" />}
              My requests
            </Link>
            <Link href={clearHref} className={buttonClass({ variant: "ghost", size: "sm" })}><X aria-hidden="true" strokeWidth={1.75} />Clear filters</Link>
          </div>
        </div>
      </details>
    </form>
  );
}
