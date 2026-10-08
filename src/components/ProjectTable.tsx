import Link from "next/link";
import type { ProjectStatus } from "@prisma/client";
import { StatusIcon, deadlineText } from "./status";
import { daysLeft } from "@/lib/daysLeft";
import { PROJECT_STATUS_LABEL, formatJakartaDate, groupProjects } from "@/lib/projects";
import { isHttpUrl } from "@/lib/fieldSchema";

export type ProjectRow = {
  id: string; title: string; subTitle: string | null; brandName: string | null; ownerName: string;
  status: ProjectStatus; startDate: Date | null; dueDate: Date | null; fileUrl: string | null;
};

/** Shape per status (never colour alone). On hold gets a pause icon; the others reuse the request status shapes. */
export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const icon =
    status === "ON_HOLD" ? (
      <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true" focusable={false}>
        <circle cx="7" cy="7" r="5.5" /><path d="M5.6 4.8v4.4M8.4 4.8v4.4" />
      </svg>
    ) : (
      <StatusIcon status={status === "NOT_STARTED" ? "REQUESTED" : status === "IN_PROGRESS" ? "ON_PROGRESS" : status === "IN_REVIEW" ? "FIRST_LOOK" : "DONE"} />
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      {icon}{PROJECT_STATUS_LABEL[status]}
    </span>
  );
}

const TH = "px-3 py-2 font-semibold whitespace-nowrap";

/** Server component. Projects grouped by brand ("No brand" last), due date ascending inside each group. */
export function ProjectTable({ rows, canManage, now }: { rows: ProjectRow[]; canManage: boolean; now: Date }) {
  if (rows.length === 0)
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-muted-foreground">
        No projects yet.{canManage ? " Use “New project” to add the first one." : ""}
      </p>
    );
  return (
    <div className="space-y-6">
      {groupProjects(rows).map((g) => {
        const hid = `brand-${g.brand ?? "none"}`.replace(/\s+/g, "-");
        return (
          <section key={g.brand ?? "__none"} aria-labelledby={hid}>
            <h2 id={hid} className="mb-2 text-lg font-semibold">{g.brand ?? "No brand"}</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className={TH}>Project</th>
                    <th scope="col" className={TH}>Owner</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={TH}>Start</th>
                    <th scope="col" className={TH}>Due</th>
                    <th scope="col" className={TH}>Days left</th>
                    <th scope="col" className={TH}>File</th>
                    {canManage && <th scope="col" className={TH}><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {g.projects.map((p) => {
                    const left = p.status !== "DONE" && p.dueDate ? daysLeft(p.dueDate, now) : null;
                    return (
                      <tr key={p.id} className="border-t border-border">
                        <th scope="row" className="px-3 py-2 font-medium">
                          {p.title}
                          {p.subTitle && <span className="block text-xs font-normal text-muted-foreground">{p.subTitle}</span>}
                        </th>
                        <td className="px-3 py-2">{p.ownerName}</td>
                        <td className="px-3 py-2"><ProjectStatusBadge status={p.status} /></td>
                        <td className="px-3 py-2 whitespace-nowrap">{p.startDate ? formatJakartaDate(p.startDate) : "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{p.dueDate ? formatJakartaDate(p.dueDate) : "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {left !== null ? (<>{left < 0 && <span aria-hidden="true">⚠ </span>}{deadlineText(left)}</>) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {p.fileUrl && isHttpUrl(p.fileUrl) ? (
                            <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
                              Open file{" "}<span className="sr-only">for {p.title} (opens in a new tab)</span>
                            </a>
                          ) : "—"}
                        </td>
                        {canManage && (
                          <td className="px-3 py-2">
                            <Link href={`/projects/${p.id}/edit`} className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
                              Edit{" "}<span className="sr-only">{p.title}</span>
                            </Link>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
