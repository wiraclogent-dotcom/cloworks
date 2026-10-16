import type { Metadata } from "next";
import { Suspense } from "react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ProjectsView } from "@/components/ProjectsView";
import { ProjectsSkeleton } from "@/components/PageSkeletons";

/** Tab title: "Projects · Clowork" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Projects" };

async function ProjectsContent() {
  const { user, db } = await requireScope();
  const canManage = can(user.appRole, "project.manage");
  const projects = await db.project.findMany({ include: { brand: { select: { name: true } }, owner: { select: { name: true } } } });
  const rows = projects.map((p) => ({
    id: p.id, title: p.title, subTitle: p.subTitle, brandName: p.brand?.name ?? null, ownerName: p.owner.name,
    status: p.status, startDate: p.startDate, dueDate: p.dueDate, fileUrl: p.fileUrl,
  }));
  return <ProjectsView rows={rows} canManage={canManage} now={new Date()} />;
}

export default function ProjectsPage() {
  return (
    <div>
      <Suspense fallback={<ProjectsSkeleton />}>
        <ProjectsContent />
      </Suspense>
    </div>
  );
}
