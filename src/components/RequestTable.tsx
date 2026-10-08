import Link from "next/link";
import type { RequestRow, SortKey } from "@/lib/requests";
import { StatusBadge, deadlineText } from "./status";

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

/** Server component. `hrefFor(key, dir)` builds the sort link so the table stays free of URL knowledge. */
export function RequestTable({ rows, sort, dir, hrefFor }: {
  rows: RequestRow[]; sort: SortKey; dir: "asc" | "desc"; hrefFor: (key: SortKey, dir: "asc" | "desc") => string;
}) {
  if (rows.length === 0) return <p className="rounded-md border border-dashed border-border p-6 text-center text-muted-foreground">No requests match these filters.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
        <thead className="bg-muted">
          <tr>
            {COLUMNS.map((c) => {
              const active = sort === c.key;
              const next = active && dir === "asc" ? "desc" : "asc";
              return (
                <th key={c.key} scope="col" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"} className="px-3 py-2 font-semibold whitespace-nowrap">
                  <Link href={hrefFor(c.key, next)} className="inline-flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-ring">
                    {c.label}
                    <span aria-hidden="true">{active ? (dir === "asc" ? "▲" : "▼") : ""}</span>
                    <span className="sr-only">{active ? `, sorted ${dir === "asc" ? "ascending" : "descending"}. Activate to reverse.` : ", activate to sort"}</span>
                  </Link>
                </th>
              );
            })}
            <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">Days left</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const open = r.status !== "DONE" && r.status !== "CANCELLED";
            return (
              <tr key={r.id} className="border-t border-border">
                <th scope="row" className="px-3 py-2 font-medium"><Link href={`/requests/${r.id}`} className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{r.title}</Link></th>
                <td className="px-3 py-2">{r.brandName}</td>
                <td className="px-3 py-2">{r.divisionName}</td>
                <td className="px-3 py-2">{r.requesterName}</td>
                <td className="px-3 py-2">{r.assigneeName ?? <span className="text-muted-foreground">Unassigned</span>}</td>
                <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                <td className="px-3 py-2 whitespace-nowrap">{fmt.format(r.requestedAt)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.deadline ? fmt.format(r.deadline) : "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {open && r.daysLeft !== null ? (<>{r.daysLeft < 0 && <span aria-hidden="true">⚠ </span>}{deadlineText(r.daysLeft)}</>) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
