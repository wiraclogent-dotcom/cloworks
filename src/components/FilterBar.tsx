import Link from "next/link";
import type { RequestStatus } from "@prisma/client";
import type { ViewParams } from "@/app/requests/params";
import { STATUS_LABEL } from "./status";

type Opt = { id: string; name: string };
const field = "rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring";

/** Plain GET form: works without JS and keeps the URL shareable. */
export function FilterBar({ p, brands, divisions, assignees, mineHref, clearHref }: {
  p: ViewParams; brands: Opt[]; divisions: Opt[]; assignees: Opt[]; mineHref: string; clearHref: string;
}) {
  const statuses = Object.keys(STATUS_LABEL) as RequestStatus[];
  const select = (name: string, label: string, value: string | undefined, opts: Opt[]) => (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <select name={name} defaultValue={value ?? ""} className={field}>
        <option value="">All</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  );
  return (
    <form method="get" action="/requests" role="search" aria-label="Filter requests" className="flex flex-wrap items-end gap-3">
      {p.view === "table" && <input type="hidden" name="view" value="table" />}
      {p.mine && <input type="hidden" name="mine" value="1" />}
      <label className="flex flex-col gap-1 text-xs font-medium">
        Search
        <input type="search" name="q" defaultValue={p.q ?? ""} placeholder="Title or notes" className={`${field} w-48`} />
      </label>
      {select("status", "Status", p.status, statuses.map((s) => ({ id: s, name: STATUS_LABEL[s] })))}
      {select("brand", "Brand", p.brandId, brands)}
      {select("division", "Division", p.divisionId, divisions)}
      {select("assignee", "Assignee", p.assigneeId, assignees)}
      <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Apply</button>
      <Link href={mineHref} aria-pressed={p.mine} className={`rounded-md border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring ${p.mine ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
        {p.mine ? "✓ " : ""}My requests
      </Link>
      <Link href={clearHref} className="py-1.5 text-sm underline focus-visible:outline-2 focus-visible:outline-ring">Clear filters</Link>
    </form>
  );
}
