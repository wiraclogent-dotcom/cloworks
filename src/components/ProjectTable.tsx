import Link from "next/link";
import { ExternalLink, FolderKanban, Pencil } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { daysLeft } from "@/lib/daysLeft";
import { formatJakartaDate, groupProjects, isClosedProject } from "@/lib/projects";
import { isHttpUrl } from "@/lib/fieldSchema";
import { isServerPath } from "@/lib/fileLocation";
import { FileLocationLink } from "./ui/FileLocationLink";
import { brandTone } from "@/lib/palette";
import { Avatar } from "./ui/Avatar";
import { CountPill } from "./ui/Chip";
import { DeadlineChip } from "./ui/DeadlineChip";
import { EmptyState } from "./ui/EmptyState";
import { StatusChip } from "./ui/StatusChip";
import { Card } from "./ui/Card";
import { buttonClass } from "./ui/Button";
import { tableClass } from "./ui/table";
import { cn } from "./ui/cn";

export type ProjectRow = {
  id: string; title: string; subTitle: string | null; brandName: string | null; ownerName: string;
  status: ProjectStatus; startDate: Date | null; dueDate: Date | null; fileUrl: string | null;
};

/** Project status as the shared chip (palette tone + shape icon + label). Old name kept for callers. */
export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <StatusChip status={status} kind="project" />;
}

/** Same columns for every list on the page (the grouped one and the flat closed ones); widths are fixed so they line up. */
export function ProjectRowsTable({ rows, canManage, now }: { rows: ProjectRow[]; canManage: boolean; now: Date }) {
  const t = tableClass();
  return (
    <div className="relative overflow-x-auto">
      <table className={cn(t.table, "min-w-[56rem] table-fixed")}>
        <colgroup>
          <col className="w-[30%]" /><col className="w-[15%]" /><col className="w-[13%]" /><col className="w-[10%]" />
          <col className="w-[17%]" /><col className="w-[8%]" />{canManage && <col className="w-[7%]" />}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className={cn(t.th, "static")}>Project</th>
            <th scope="col" className={cn(t.th, "static")}>Owner</th>
            <th scope="col" className={cn(t.th, "static")}>Status</th>
            <th scope="col" className={cn(t.th, "static")}>Start</th>
            <th scope="col" className={cn(t.th, "static")}>Due</th>
            <th scope="col" className={cn(t.th, "static")}>File</th>
            {canManage && <th scope="col" className={cn(t.th, "static")}><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const left = !isClosedProject(p.status) && p.dueDate ? daysLeft(p.dueDate, now) : null;
            return (
              <tr key={p.id} className={t.tr}>
                <th scope="row" className={t.rowHeader}>
                  <Link href={`/projects/${p.id}`} className="line-clamp-2 underline-offset-2 hover:underline">{p.title}</Link>
                  {p.subTitle && <span className="block truncate text-xs font-normal text-foreground-secondary">{p.subTitle}</span>}
                </th>
                <td className={t.td}>
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar name={p.ownerName} size="sm" decorative />
                    <span className="truncate">{p.ownerName}</span>
                  </span>
                </td>
                <td className={t.td}><StatusChip status={p.status} kind="project" /></td>
                <td className={cn(t.td, "whitespace-nowrap tabular-nums")}>{p.startDate ? formatJakartaDate(p.startDate) : "—"}</td>
                <td className={t.td}>
                  <span className="flex flex-col items-start gap-1">
                    <span className="whitespace-nowrap tabular-nums">{p.dueDate ? formatJakartaDate(p.dueDate) : "—"}</span>
                    {left !== null ? <DeadlineChip daysLeft={left} /> : null}
                  </span>
                </td>
                <td className={t.td}>
                  {p.fileUrl && isHttpUrl(p.fileUrl) ? (
                    <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md font-medium text-link hover:underline">
                      <ExternalLink aria-hidden="true" strokeWidth={1.75} className="size-3.5" />
                      Open file{" "}<span className="sr-only">for {p.title} (opens in a new tab)</span>
                    </a>
                  ) : p.fileUrl && isServerPath(p.fileUrl) ? (
                    <FileLocationLink href={p.fileUrl}>{p.fileUrl}</FileLocationLink>
                  ) : <span className="text-foreground-secondary">—</span>}
                </td>
                {canManage && (
                  <td className={cn(t.td, "text-right")}>
                    <Link href={`/projects/${p.id}/edit`} className={buttonClass({ variant: "ghost", size: "sm", className: "px-2" })}>
                      <Pencil aria-hidden="true" />Edit{" "}<span className="sr-only">{p.title}</span>
                    </Link>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Server component. One card; projects grouped by brand ("No brand" last), due date ascending inside each group. Each
 * group is a section with a header strip (brand accent bar, brand name as h2, count) and its own table; the column
 * widths are fixed so the groups line up like one table. `emptyTitle` / `emptyDescription` replace the empty-state copy.
 */
export function ProjectTable({ rows, canManage, now, emptyTitle = "No projects yet.", emptyDescription }: {
  rows: ProjectRow[]; canManage: boolean; now: Date; emptyTitle?: string; emptyDescription?: string;
}) {
  if (rows.length === 0)
    return (
      <EmptyState art="empty-projects" icon={<FolderKanban />} title={emptyTitle}
        description={emptyDescription ?? (canManage ? "Use “New project” to add the first one." : undefined)} />
    );
  return (
    <Card padded={false} className="overflow-hidden">
      {groupProjects(rows).map((g, gi) => {
        const hid = `brand-${g.brand ?? "none"}`.replace(/\s+/g, "-");
        return (
          <section key={g.brand ?? "__none"} aria-labelledby={hid} className={cn(gi > 0 && "border-t border-border")}>
            <div data-tone={g.brand ? brandTone(g.brand) : "tag-neutral"} data-group-header=""
              className="flex items-center gap-2 border-l-4 border-tone-accent bg-surface-muted px-4 py-2.5">
              <h2 id={hid} className="text-[15px] font-semibold text-foreground">{g.brand ?? "No brand"}</h2>
              <CountPill value={g.projects.length} aria-label={`${g.projects.length} ${g.projects.length === 1 ? "project" : "projects"}`} className="bg-surface" />
            </div>
            <ProjectRowsTable rows={g.projects} canManage={canManage} now={now} />
          </section>
        );
      })}
    </Card>
  );
}
