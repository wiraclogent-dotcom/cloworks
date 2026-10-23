import type { Metadata } from "next";
import { brandOptions } from "@/lib/lists";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ProjectPageView } from "./ProjectPageView";
import { Skeleton } from "@/components/shadcn/skeleton";

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
  const { user, db } = await requireScope();
  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } },
      owner: { select: { name: true } },
      tasks: { orderBy: { position: "asc" }, include: { owner: { select: { name: true } } } },
      milestones: { orderBy: { date: "asc" } },
    },
  });
  if (!project) notFound();

  const canManage = can(user.appRole, "project.manage");
  // Only managers edit, so only managers need the pick lists.
  const [brands, owners, taskOwners] = canManage
    ? await Promise.all([
        brandOptions(db, [project.brandId]),
        // Keep the current owner selectable even if they have since been deactivated, so saving other fields works.
        db.user.findMany({ where: { OR: [{ active: true }, { id: project.ownerId }] }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        // Item owners are designers only.
        db.user.findMany({ where: { active: true, jobRole: "DESIGNER" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      ])
    : [[], [], []];

  return <ProjectPageView project={project} canManage={canManage} brands={brands} owners={owners} taskOwners={taskOwners} now={new Date()} />;
}
