import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, SearchX } from "lucide-react";
import type { RequestRow, SortKey } from "@/lib/requests";
import { NeedsMotionBadge, StatusBadge } from "./status";
import { Avatar } from "./ui/Avatar";
import { BrandTag } from "./ui/Chip";
import { DeadlineChip } from "./ui/DeadlineChip";
import { EmptyState } from "./ui/EmptyState";
import { tableClass } from "./ui/table";
import { cn, focusRing } from "./ui/cn";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Request" },
  { key: "brand", label: "Brand" },
  { key: "division", label: "Division" },
  { key: "requester", label: "Requester" },
  { key: "assignee", label: "Assignee" },
  { key: "status", label: "Status" },
  { key: "requested", label: "Requested" },
  { key: "deadline", label: "Deadline" },
];

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const t = tableClass({ minWidth: "min-w-[64rem]" });
/** 44px rows. */
const ROW = cn(t.tr, "h-11");

function Person({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={name} size="sm" decorative />
      <span className="truncate">{name}</span>
    </span>
  );
}

/**
 * Server component. `hrefFor(key, dir)` builds the sort link so the table stays free of URL knowledge. Renders the
 * monday-style table card (sticky header, scrolls sideways inside the card on narrow screens); `footer` (pagination)
 * sits at the bottom of the same card.
 */
export function RequestTable({ rows, sort, dir, hrefFor, footer }: {
  rows: RequestRow[]; sort: SortKey; dir: "asc" | "desc"; hrefFor: (key: SortKey, dir: "asc" | "desc") => string; footer?: ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <>
        <EmptyState icon={<SearchX aria-hidden="true" strokeWidth={1.75} />} title="No requests match these filters." />
        {footer ? <div className="mt-3 overflow-hidden rounded-xl border border-border shadow-card [&>nav]:border-t-0">{footer}</div> : null}
      </>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="relative max-h-[calc(100dvh-15rem)] overflow-auto" data-table-scroll="">
        <table className={t.table}>
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const active = sort === c.key;
                const next = active && dir === "asc" ? "desc" : "asc";
                const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className={t.th}>
                    <Link href={hrefFor(c.key, next)}
                      className={cn("group/sort -mx-1 -my-1.5 inline-flex min-h-8 items-center gap-1 rounded-md px-1 py-1 hover:bg-surface hover:text-foreground", active && "text-foreground", focusRing)}>
                      {c.label}
                      <Icon aria-hidden="true" strokeWidth={1.75} data-sort-icon={active ? dir : "none"}
                        className={cn("size-3.5", active ? "opacity-100" : "opacity-50 group-hover/sort:opacity-100")} />
                      <span className="sr-only">{active ? `, sorted ${dir === "asc" ? "ascending" : "descending"}. Activate to reverse.` : ", activate to sort"}</span>
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const open = r.status !== "DONE" && r.status !== "CANCELLED";
              return (
                <tr key={r.id} className={ROW}>
                  <th scope="row" className={cn(t.rowHeader, "max-w-80 min-w-56")}>
                    <Link href={`/requests/${r.id}`} className={cn("line-clamp-2 rounded-sm break-words text-foreground underline-offset-2 hover:underline", focusRing)}>{r.title}</Link>
                    {r.needsMotion && <div className="mt-1"><NeedsMotionBadge /></div>}
                  </th>
                  <td className={t.td}><BrandTag name={r.brandName} /></td>
                  <td className={cn(t.td, "text-foreground-secondary")}>{r.divisionName}</td>
                  <td className={cn(t.td, "max-w-48")}><Person name={r.requesterName} /></td>
                  <td className={cn(t.td, "max-w-48")} data-cell="assignee">
                    {r.assigneeName ? <Person name={r.assigneeName} /> : <span className="text-foreground-secondary italic">Unassigned</span>}
                  </td>
                  <td className={t.td}><StatusBadge status={r.status} /></td>
                  <td className={cn(t.td, "whitespace-nowrap tabular-nums")}>{fmt.format(r.requestedAt)}</td>
                  <td className={cn(t.td, "whitespace-nowrap tabular-nums")} data-cell="deadline">
                    <span className="flex items-center gap-2">
                      <span>{r.deadline ? fmt.format(r.deadline) : "—"}</span>
                      {open && r.daysLeft !== null && <DeadlineChip daysLeft={r.daysLeft} />}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
