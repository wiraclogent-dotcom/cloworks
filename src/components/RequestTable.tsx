import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, SearchX } from "lucide-react";
import type { RequestRow, SortKey } from "@/lib/requests";
import { NeedsMotionBadge, StatusBadge } from "./status";
import { assigneeLabel } from "@/lib/assignees";
import { Card } from "@/components/shadcn/card";
import { Avatar, AvatarStack } from "./ui/Avatar";
import { BrandTag } from "./ui/BrandTag";
import { DeadlineChip } from "./ui/DeadlineChip";
import { EmptyState } from "./ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/shadcn/table";
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

function Person({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={name} size="sm" decorative />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Several assignees: stacked avatars plus "A & B" for two, "A, B +N" for more. */
function Assignees({ names }: { names: string[] }) {
  const text = names.length === 2 ? assigneeLabel(names) : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  return (
    <span className="flex min-w-0 items-center gap-2" title={`Assignees: ${names.join(", ")}`}>
      <AvatarStack names={names} max={3} size="sm" label="Assignees" />
      <span aria-hidden="true" className="truncate">{text}</span>
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
        <EmptyState art="empty-search" icon={<SearchX aria-hidden="true" strokeWidth={1.75} />} title="No requests match these filters." />
        {footer ? <div className="mt-3 overflow-hidden rounded-xl border border-border shadow-card [&>nav]:border-t-0">{footer}</div> : null}
      </>
    );
  }
  return (
    <Card className="overflow-hidden p-0">
      <Table containerClassName="max-h-[calc(100dvh-15rem)]" className="min-w-[64rem]">
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => {
              const active = sort === c.key;
              const next = active && dir === "asc" ? "desc" : "asc";
              const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <TableHead key={c.key} scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                  <Link href={hrefFor(c.key, next)}
                    className={cn("group/sort -mx-1 -my-1.5 inline-flex min-h-8 items-center gap-1 rounded-md px-1 py-1 hover:bg-card hover:text-foreground", active && "text-foreground", focusRing)}>
                    {c.label}
                    <Icon aria-hidden="true" strokeWidth={1.75} data-sort-icon={active ? dir : "none"}
                      className={cn("size-3.5", active ? "opacity-100" : "opacity-50 group-hover/sort:opacity-100")} />
                    <span className="sr-only">{active ? `, sorted ${dir === "asc" ? "ascending" : "descending"}. Activate to reverse.` : ", activate to sort"}</span>
                  </Link>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const open = r.status !== "DONE" && r.status !== "CANCELLED";
            return (
              <TableRow key={r.id} className="h-11">
                <TableRowHeader className="max-w-80 min-w-56">
                  <Link href={`/requests/${r.id}`} className={cn("line-clamp-2 rounded-sm break-words text-foreground underline-offset-2 hover:underline", focusRing)}>{r.title}</Link>
                  {(r.needsMotion || r.isVideo) && <div className="mt-1"><NeedsMotionBadge video={r.isVideo} /></div>}
                </TableRowHeader>
                <TableCell><BrandTag name={r.brandName} /></TableCell>
                <TableCell className="text-muted-foreground">{r.divisionName}</TableCell>
                <TableCell className="max-w-48"><Person name={r.requesterName} /></TableCell>
                <TableCell className="max-w-48" data-cell="assignee">
                  {r.assignees.length >= 2 ? <Assignees names={r.assignees.map((a) => a.name)} /> : r.assignees[0] ? <Person name={r.assignees[0].name} /> : <span className="text-muted-foreground italic">Unassigned</span>}
                </TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{fmt.format(r.requestedAt)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums" data-cell="deadline">
                  <span className="flex items-center gap-2">
                    <span>{r.deadline ? fmt.format(r.deadline) : "—"}</span>
                    {open && r.daysLeft !== null && <DeadlineChip daysLeft={r.daysLeft} />}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {footer}
    </Card>
  );
}
