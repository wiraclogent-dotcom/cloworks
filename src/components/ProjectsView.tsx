import { Plus } from "lucide-react";
import Link from "next/link";
import { splitProjects } from "@/lib/projects";
import { ProjectRowsTable, ProjectTable, type ProjectRow } from "./ProjectTable";
import { ProjectTimeline } from "./ProjectTimeline";
import { PageHeader } from "./ui/PageHeader";
import { Card, CardHeader, CardTitle } from "./ui/Card";
import { CollapsibleSection } from "./ui/CollapsibleSection";
import { Button } from "@/components/shadcn/button";

/**
 * The /projects page body: header, the timeline and the brand-grouped table for ACTIVE projects, then collapsible
 * lists of completed and canceled ones (same table columns, flat, latest due first; a list with no rows is left out).
 */
export function ProjectsView({ rows, canManage, now }: { rows: ProjectRow[]; canManage: boolean; now: Date }) {
  const { active, completed, canceled } = splitProjects(rows);
  const closedParts = [completed.length > 0 && `${completed.length} completed`, canceled.length > 0 && `${canceled.length} canceled`].filter(Boolean);
  const hasClosed = closedParts.length > 0;
  return (
    <>
      <PageHeader breadcrumb={[{ label: "Work" }, { label: "Projects" }]} title="Projects" count={active.length}
        description={["Active projects grouped by brand, soonest due first", ...closedParts].join(" · ")}
        actions={canManage && (
          <Button asChild variant="default"><Link href="/projects/new">
            <Plus aria-hidden="true" />New project
          </Link></Button>
        )} />
      {active.length > 0 && (
        <Card className="mb-5">
          <section aria-labelledby="timeline-h">
            <CardHeader>
              <CardTitle id="timeline-h">Timeline</CardTitle>
            </CardHeader>
            <ProjectTimeline projects={active} today={now} href={(p) => `/projects/${p.id}`} />
          </section>
        </Card>
      )}
      <div data-active-projects="">
        <ProjectTable rows={active} canManage={canManage} now={now}
          emptyTitle={hasClosed ? "No active projects." : undefined}
          emptyDescription={hasClosed ? (canManage ? "Use “New project” to start one, or open the lists below." : "Completed and canceled projects are listed below.") : undefined} />
      </div>
      {hasClosed && (
        <div className="mt-5 grid gap-4">
          {completed.length > 0 && (
            <CollapsibleSection id="completed" storageKey="cloworks:projects:completed-open" title="Completed projects" count={completed.length}>
              <ProjectRowsTable rows={completed} canManage={canManage} now={now} />
            </CollapsibleSection>
          )}
          {canceled.length > 0 && (
            <CollapsibleSection id="canceled" storageKey="cloworks:projects:canceled-open" title="Canceled projects" count={canceled.length}>
              <ProjectRowsTable rows={canceled} canManage={canManage} now={now} />
            </CollapsibleSection>
          )}
        </div>
      )}
    </>
  );
}
