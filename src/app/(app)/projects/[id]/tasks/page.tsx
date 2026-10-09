import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { jakartaIso } from "@/lib/projectTasks";
import { taskMode } from "@/lib/projectProgress";
import { TaskRow } from "./TaskRow";
import { AddDetailForm } from "./AddDetailForm";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Skeleton } from "@/components/ui/Skeleton";

export const metadata: Metadata = { title: "Project details" };

export default function ProjectTasksPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <ProjectTasksContent params={params} />
    </Suspense>
  );
}

async function ProjectTasksContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserOrRedirect();
  const canManage = can(user.appRole, "project.manage");
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } },
      tasks: { orderBy: { position: "asc" }, include: { owner: { select: { name: true } } } },
    },
  });
  if (!project) notFound();

  const taskCount = project.tasks.length;
  // Design projects set stages; tracker projects set statuses. The column shows whichever this project uses.
  const mode = taskMode(project.tasks);
  // Owners are designers only.
  const owners = canManage
    ? await prisma.user.findMany({ where: { active: true, jobRole: "DESIGNER" }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];
  const products = new Set(project.tasks.map((t) => t.title)).size;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Work" }, { label: "Projects", href: "/projects" }, { label: project.title }]}
        title={project.title}
        count={taskCount}
        description={`${products} ${products === 1 ? "item" : "items"} · ${project.brand?.name ?? "No brand"} · ${project.code ?? "no code"}`}
      />
      {canManage && <div className="mb-4"><AddDetailForm projectId={project.id} mode={mode} owners={owners} /></div>}
      <Card padded={false}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>{mode === "status" ? "Status" : "Stage"}</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>File</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {project.tasks.map((t, i) => (
              <TaskRow
                key={t.id}
                isFirst={i === 0}
                isLast={i === taskCount - 1}
                projectId={project.id}
                canManage={canManage}
                owners={owners}
                mode={mode}
                task={{
                  id: t.id,
                  title: t.title,
                  subTitle: t.subTitle,
                  ownerId: t.ownerId,
                  ownerName: t.owner?.name ?? null,
                  stage: t.stage,
                  status: t.status,
                  startIso: t.startDate ? jakartaIso(t.startDate) : null,
                  dueIso: t.dueDate ? jakartaIso(t.dueDate) : null,
                  dueTbc: t.dueTbc,
                  fileName: t.fileName,
                  fileUrl: t.fileUrl,
                  notes: t.notes,
                }}
              />
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
