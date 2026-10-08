import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ProjectTable } from "@/components/ProjectTable";
import { ProjectTimeline } from "@/components/ProjectTimeline";

async function ProjectsContent() {
  const user = await requireUser();
  const canManage = can(user.appRole, "project.manage");
  const projects = await prisma.project.findMany({ include: { brand: { select: { name: true } }, owner: { select: { name: true } } } });
  const rows = projects.map((p) => ({
    id: p.id, title: p.title, subTitle: p.subTitle, brandName: p.brand?.name ?? null, ownerName: p.owner.name,
    status: p.status, startDate: p.startDate, dueDate: p.dueDate, fileUrl: p.fileUrl,
  }));
  const now = new Date();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {canManage && (
          <Link href="/projects/new" className="ml-auto rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            New project
          </Link>
        )}
      </div>
      <ProjectTable rows={rows} canManage={canManage} now={now} />
      {rows.length > 0 && (
        <section aria-labelledby="timeline-h" className="mt-8">
          <h2 id="timeline-h" className="mb-2 text-lg font-semibold">Timeline</h2>
          <ProjectTimeline projects={rows} today={now} />
        </section>
      )}
    </>
  );
}

export default function ProjectsPage() {
  return (
    <main className="mx-auto w-full max-w-[96rem] p-4 sm:p-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading projects…</p>}>
        <ProjectsContent />
      </Suspense>
    </main>
  );
}
