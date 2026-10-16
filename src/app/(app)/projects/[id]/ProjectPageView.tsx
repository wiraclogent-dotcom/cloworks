import Link from "next/link";
import type { Prisma, ProjectStatus } from "@prisma/client";
import { MilestoneList } from "./MilestoneList";
import type { TaskRowData } from "./tasks/TaskRow";
import { ProjectTimeline } from "@/components/ProjectTimeline";
import { ProjectDetailsCard } from "@/components/projects/ProjectDetailsCard";
import { ProjectProgressSummary } from "@/components/projects/ProjectProgressSummary";
import { NeedsAttention } from "@/components/projects/NeedsAttention";
import { ProjectItemsList } from "@/components/projects/ProjectItemsList";
import { ItemHashOpener } from "@/components/projects/ItemHashOpener";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { groupItems } from "@/lib/projectItemList";
import { productSummaries, taskMode } from "@/lib/projectProgress";
import { jakartaIso } from "@/lib/projectTasks";
import { Button } from "@/components/shadcn/button";

/** What the page loads: the project with brand and owner names, rows (with owner name) and milestones. */
export type ProjectPageProject = Prisma.ProjectGetPayload<{
  include: {
    brand: { select: { name: true } };
    owner: { select: { name: true } };
    tasks: { include: { owner: { select: { name: true } } } };
    milestones: true;
  };
}>;

type Opt = { id: string; name: string };

/** The project page, top to bottom: header, details, progress, needs attention, the item list, then the timeline and
 *  milestones as collapsed sections. Pure rendering; the page does the loading. */
export function ProjectPageView({ project, canManage, brands, owners, taskOwners, now }: {
  project: ProjectPageProject; canManage: boolean; brands: Opt[]; owners: Opt[]; taskOwners: Opt[]; now: Date;
}) {
  const tasks = [...project.tasks].sort((a, b) => a.position - b.position);
  // Design projects track a stage per detail; tracker projects track a status. Everything below follows whichever it uses.
  const mode = taskMode(tasks);
  const rows = tasks.map((t) => ({
    id: t.id, title: t.title, subTitle: t.subTitle, position: t.position, ownerId: t.ownerId, ownerName: t.owner?.name ?? null,
    stage: t.stage, status: t.status, startDate: t.startDate, dueDate: t.dueDate, dueTbc: t.dueTbc,
  }));
  const items = groupItems(rows, mode);
  const rowsData = new Map<string, TaskRowData>(tasks.map((t) => [t.id, {
    id: t.id, title: t.title, subTitle: t.subTitle, ownerId: t.ownerId, ownerName: t.owner?.name ?? null,
    stage: t.stage, status: t.status,
    startIso: t.startDate ? jakartaIso(t.startDate) : null, dueIso: t.dueDate ? jakartaIso(t.dueDate) : null,
    dueTbc: t.dueTbc, fileName: t.fileName, fileUrl: t.fileUrl, notes: t.notes,
  }]));

  const productStatus = (p: { variants: number; finalCount: number }): ProjectStatus =>
    p.variants > 0 && p.finalCount === p.variants ? "DONE" : "IN_PROGRESS";
  const timelineItems = productSummaries(tasks, mode).map((p, i) => ({
    id: `product-${i}`, title: p.title, startDate: p.startDate, dueDate: p.dueDate, status: productStatus(p),
  }));
  const milestones = project.milestones.map((m) => ({ id: m.id, title: m.title, dateIso: jakartaIso(m.date), done: m.done }));

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Work" }, { label: "Projects", href: "/projects" }, { label: project.title }]}
        title={project.title}
        description={`${project.brand?.name ?? "No brand"} · ${project.code ?? "no code"} · Owner ${project.owner.name}`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip status={project.status} kind="project" />
            <Button asChild variant="outline"><Link href="/projects">Back to projects</Link></Button>
          </span>
        }
      />
      <div className="space-y-5">
        <ProjectDetailsCard
          project={{
            id: project.id, title: project.title, subTitle: project.subTitle,
            brandName: project.brand?.name ?? null, brandId: project.brandId, ownerId: project.ownerId, ownerName: project.owner.name,
            status: project.status,
            startIso: project.startDate ? jakartaIso(project.startDate) : null, dueIso: project.dueDate ? jakartaIso(project.dueDate) : null,
            fileUrl: project.fileUrl,
          }}
          brands={brands} owners={owners} canManage={canManage}
        />
        <ProjectProgressSummary rows={rows} items={items} />
        <NeedsAttention items={items} now={now} mode={mode} />
        <ProjectItemsList projectId={project.id} items={items} rowsData={rowsData} mode={mode} owners={taskOwners} canManage={canManage} />
        <ItemHashOpener />
        <CollapsibleSection id="timeline" storageKey="project-timeline-open" title="Timeline by item" count={timelineItems.length}>
          <div className="p-4"><ProjectTimeline projects={timelineItems} today={now} /></div>
        </CollapsibleSection>
        <CollapsibleSection id="milestones" storageKey="project-milestones-open" title="Meetings and milestones" count={milestones.length}>
          <div className="p-4"><MilestoneList projectId={project.id} canManage={canManage} milestones={milestones} /></div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
