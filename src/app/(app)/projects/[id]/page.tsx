import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { formatJakartaDate } from "@/lib/projects";
import { PROJECT_STAGE_LABEL, TASK_STATUS_LABEL, TASK_STATUS_ORDER, jakartaIso } from "@/lib/projectTasks";
import { PROJECT_STAGES, finalShare, productSummaries, stageCounts, statusCounts, taskMode } from "@/lib/projectProgress";
import { MilestoneList } from "./MilestoneList";
import { ProjectTimeline } from "@/components/ProjectTimeline";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { buttonClass } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Progress } from "@/components/shadcn/progress";
import { Badge } from "@/components/shadcn/badge";

export const metadata: Metadata = { title: "Project" };

type Params = Promise<{ id: string }>;

export default function ProjectDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ProjectDetailContent params={params} />
    </Suspense>
  );
}

async function ProjectDetailContent({ params }: { params: Params }) {
  const user = await requireUserOrRedirect();
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } },
      owner: { select: { name: true } },
      tasks: { orderBy: { position: "asc" } },
      milestones: { orderBy: { date: "asc" } },
    },
  });
  if (!project) notFound();

  const canManage = can(user.appRole, "project.manage");
  const tasks = project.tasks;
  // Design projects track a stage per detail; tracker projects track a status. Progress follows whichever it uses.
  const mode = taskMode(tasks);
  const products = productSummaries(tasks, mode);
  const share = finalShare(tasks, mode);
  const stageTally = stageCounts(tasks);
  const statusTally = statusCounts(tasks);
  const breakdown = mode === "status"
    ? TASK_STATUS_ORDER.map((st) => ({ key: st, label: TASK_STATUS_LABEL[st], n: statusTally[st] }))
    : PROJECT_STAGES.map((st) => ({ key: st, label: PROJECT_STAGE_LABEL[st], n: stageTally[st] }));
  const unset = mode === "status" ? statusTally.none : stageTally.none;
  const productStatus = (p: { variants: number; finalCount: number }): ProjectStatus =>
    p.variants > 0 && p.finalCount === p.variants ? "DONE" : "IN_PROGRESS";
  const timelineItems = products.map((p, i) => ({
    id: `product-${i}`,
    title: p.title,
    startDate: p.startDate,
    dueDate: p.dueDate,
    status: productStatus(p),
  }));
  const lastDue = tasks.map((t) => t.dueDate).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
  const anyTbc = tasks.some((t) => t.dueTbc);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Work" }, { label: "Projects", href: "/projects" }, { label: project.title }]}
        title={project.title}
        description={`${project.brand?.name ?? "No brand"} · ${project.code ?? "no code"} · Owner ${project.owner.name}`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip status={project.status} />
            <Link href={`/projects/${project.id}/tasks`} className={buttonClass({ variant: "secondary" })}>All details</Link>
            {/* Plain link: a client-side jump here is matched by the list page's @modal "(.)[id]/edit" intercept and 404s. */}
            {canManage && <a href={`/projects/${project.id}/edit`} className={buttonClass({ variant: "secondary" })}>Edit</a>}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Items" value={products.length} />
        <Stat label="Details" value={tasks.length} />
        <Stat label="Completed" value={`${share.percent}%`} sub={`${share.done} of ${share.total} details`} />
        <Stat label="Last due date" value={lastDue ? formatJakartaDate(lastDue) : "—"} sub={anyTbc ? "Some due dates TBC" : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{mode === "status" ? "Progress by status" : "Progress by stage"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {breakdown.map(({ key, label, n }) => {
            const pct = tasks.length === 0 ? 0 : Math.round((n / tasks.length) * 100);
            return (
              <div key={key} className="grid gap-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary">{label}</Badge>
                  </span>
                  <span className="tabular-nums text-foreground-secondary">{n} of {tasks.length} details · {pct}%</span>
                </div>
                <Progress value={pct} aria-label={`${label}: ${n} of ${tasks.length}`} />
              </div>
            );
          })}
          {unset > 0 && (
            <p className="text-sm text-foreground-secondary">{unset} detail{unset === 1 ? "" : "s"} without a {mode} yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline by item</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectTimeline projects={timelineItems} today={new Date()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meetings and milestones</CardTitle>
        </CardHeader>
        <CardContent>
          <MilestoneList
            projectId={project.id}
            canManage={canManage}
            milestones={project.milestones.map((m) => ({ id: m.id, title: m.title, dateIso: jakartaIso(m.date), done: m.done }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="grid gap-0.5">
        <span className="text-xs font-medium text-foreground-secondary">{label}</span>
        <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
        {sub && <span className="text-xs text-foreground-secondary">{sub}</span>}
      </CardContent>
    </Card>
  );
}
