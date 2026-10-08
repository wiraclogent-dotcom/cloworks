import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ProjectTable } from "@/components/ProjectTable";
import { ProjectTimeline } from "@/components/ProjectTimeline";
import { ProjectsSkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { buttonClass } from "@/components/ui/Button";
import { Plus } from "lucide-react";

/** Tab title: "Projects · Creative Tracker" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Projects" };

async function ProjectsContent() {
  const user = await requireUserOrRedirect();
  const canManage = can(user.appRole, "project.manage");
  const projects = await prisma.project.findMany({ include: { brand: { select: { name: true } }, owner: { select: { name: true } } } });
  const rows = projects.map((p) => ({
    id: p.id, title: p.title, subTitle: p.subTitle, brandName: p.brand?.name ?? null, ownerName: p.owner.name,
    status: p.status, startDate: p.startDate, dueDate: p.dueDate, fileUrl: p.fileUrl,
  }));
  const now = new Date();
  return (
    <>
      <PageHeader title="Projects" count={rows.length} description="Brand projects grouped by brand, soonest due first."
        actions={canManage && (
          <Link href="/projects/new" className={buttonClass({ variant: "primary" })}>
            <Plus aria-hidden="true" />New project
          </Link>
        )} />
      <ProjectTable rows={rows} canManage={canManage} now={now} />
      {rows.length > 0 && (
        <Card className="mt-6">
          <section aria-labelledby="timeline-h">
            <CardHeader>
              <CardTitle id="timeline-h">Timeline</CardTitle>
            </CardHeader>
            <ProjectTimeline projects={rows} today={now} />
          </section>
        </Card>
      )}
    </>
  );
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
