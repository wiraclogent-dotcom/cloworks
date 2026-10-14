import Link from "next/link";
import { ExternalLink, FolderKanban, Pencil } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { daysLeft } from "@/lib/daysLeft";
import { formatJakartaDate, groupProjects, isClosedProject } from "@/lib/projects";
import { isHttpUrl } from "@/lib/fieldSchema";
import { isServerPath } from "@/lib/fileLocation";
import { FileLocationLink } from "./ui/FileLocationLink";
import { Avatar } from "./ui/Avatar";
import { Badge } from "@/components/shadcn/badge";
import { DeadlineChip } from "./ui/DeadlineChip";
import { EmptyState } from "./ui/EmptyState";
import { StatusChip } from "./ui/StatusChip";
import { Card } from "@/components/shadcn/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/shadcn/table";
import { cn } from "./ui/cn";
import { Button } from "@/components/shadcn/button";

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
  return (
    <Table className="min-w-[56rem] table-fixed">
      <colgroup>
        <col className="w-[30%]" /><col className="w-[15%]" /><col className="w-[13%]" /><col className="w-[10%]" />
        <col className="w-[17%]" /><col className="w-[8%]" />{canManage && <col className="w-[7%]" />}
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className="static">Project</TableHead>
          <TableHead scope="col" className="static">Owner</TableHead>
          <TableHead scope="col" className="static">Status</TableHead>
          <TableHead scope="col" className="static">Start</TableHead>
          <TableHead scope="col" className="static">Due</TableHead>
          <TableHead scope="col" className="static">File</TableHead>
          {canManage && <TableHead scope="col" className="static"><span className="sr-only">Actions</span></TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => {
          const left = !isClosedProject(p.status) && p.dueDate ? daysLeft(p.dueDate, now) : null;
          return (
            <TableRow key={p.id}>
              <TableRowHeader>
                <Link href={`/projects/${p.id}`} className="line-clamp-2 underline-offset-2 hover:underline">{p.title}</Link>
                {p.subTitle && <span className="block truncate text-xs font-normal text-muted-foreground">{p.subTitle}</span>}
              </TableRowHeader>
              <TableCell>
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={p.ownerName} size="sm" decorative />
                  <span className="truncate">{p.ownerName}</span>
                </span>
              </TableCell>
              <TableCell><StatusChip status={p.status} kind="project" /></TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{p.startDate ? formatJakartaDate(p.startDate) : "—"}</TableCell>
              <TableCell>
                <span className="flex flex-col items-start gap-1">
                  <span className="whitespace-nowrap tabular-nums">{p.dueDate ? formatJakartaDate(p.dueDate) : "—"}</span>
                  {left !== null ? <DeadlineChip daysLeft={left} /> : null}
                </span>
              </TableCell>
              <TableCell>
                {p.fileUrl && isHttpUrl(p.fileUrl) ? (
                  <a href={p.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md font-medium text-link hover:underline">
                    <ExternalLink aria-hidden="true" strokeWidth={1.75} className="size-3.5" />
                    Open file{" "}<span className="sr-only">for {p.title} (opens in a new tab)</span>
                  </a>
                ) : p.fileUrl && isServerPath(p.fileUrl) ? (
                  <FileLocationLink href={p.fileUrl}>{p.fileUrl}</FileLocationLink>
                ) : <span className="text-muted-foreground">—</span>}
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm" className="px-2"><Link href={`/projects/${p.id}/edit`}>
                    <Pencil aria-hidden="true" />Edit{" "}<span className="sr-only">{p.title}</span>
                  </Link></Button>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
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
      <EmptyState icon={<FolderKanban />} title={emptyTitle}
        description={emptyDescription ?? (canManage ? "Use “New project” to add the first one." : undefined)} />
    );
  return (
    <Card className="overflow-hidden p-0">
      {groupProjects(rows).map((g, gi) => {
        const hid = `brand-${g.brand ?? "none"}`.replace(/\s+/g, "-");
        return (
          <section key={g.brand ?? "__none"} aria-labelledby={hid} className={cn(gi > 0 && "border-t border-border")}>
            <div data-group-header="" className="flex items-center gap-2 bg-muted px-4 py-2.5">
              <h2 id={hid} className="text-base font-semibold text-heading">{g.brand ?? "No brand"}</h2>
              <Badge variant="count" aria-label={`${g.projects.length} ${g.projects.length === 1 ? "project" : "projects"}`} className="bg-card">{g.projects.length}</Badge>
            </div>
            <ProjectRowsTable rows={g.projects} canManage={canManage} now={now} />
          </section>
        );
      })}
    </Card>
  );
}
