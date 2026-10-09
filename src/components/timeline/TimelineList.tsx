import { useId } from "react";
import Link from "next/link";
import type { TimelineRow } from "@/lib/requests";
import { shortDay, type TimelinePerson } from "@/lib/workload";
import { STATUS_LABEL, StatusIcon } from "../status";
import { cn, focusRing } from "../ui/cn";
import { PersonHeading } from "./PersonHeading";

function PersonList({ person, rows }: { person: TimelinePerson; rows: Map<string, TimelineRow> }) {
  const headingId = useId();
  const bars = person.lanes.flat().sort((a, b) => a.startCol - b.startCol || a.endCol - b.endCol);
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-border bg-card p-3 shadow-card">
      <PersonHeading person={person} headingId={headingId} />
      {bars.length === 0 ? (
        <p className="mt-2 text-sm text-foreground-secondary">No open requests</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {bars.map((b) => {
            const row = rows.get(b.id);
            if (!row) return null;
            return (
              <li key={b.id} className="flex items-start gap-2 py-2 text-sm">
                <span className="mt-0.5 inline-flex shrink-0 text-foreground-secondary" title={STATUS_LABEL[row.status]}>
                  <StatusIcon status={row.status} />
                  <span className="sr-only">{`Status: ${STATUS_LABEL[row.status]}. `}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/requests/${row.id}`} className={cn("font-medium break-words text-foreground underline-offset-2 hover:underline", focusRing)}>{row.title}</Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-foreground-secondary">
                    <span className="tabular-nums">{`${shortDay(row.requestDay)} → ${row.deadlineDay ? shortDay(row.deadlineDay) : "no deadline"}`}</span>
                    {b.overdue && <span data-tone="overdue" className="rounded-md bg-tone-tint px-1.5 py-px font-medium text-tone-text">Overdue</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Narrow screens: the same people as a list, each request with its date range; no sideways scrolling. */
export function TimelineList({ persons, rows }: { persons: TimelinePerson[]; rows: Map<string, TimelineRow> }) {
  return <div className="space-y-3">{persons.map((p) => <PersonList key={p.key} person={p} rows={rows} />)}</div>;
}
