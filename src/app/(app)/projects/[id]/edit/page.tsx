import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { jakartaDate } from "@/lib/createRequest";
import { ProjectForm } from "../../ProjectForm";

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserOrRedirect();
  if (!can(user.appRole, "project.manage")) return <p role="alert">You are not allowed to edit projects.</p>;
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();
  const [brands, owners] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Keep the current owner selectable even if they have since been deactivated, so saving other fields works.
    prisma.user.findMany({ where: { OR: [{ active: true }, { id: project.ownerId }] }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <ProjectForm
      projectId={project.id} brands={brands} owners={owners}
      initial={{
        title: project.title, subTitle: project.subTitle ?? "", brandId: project.brandId ?? "", ownerId: project.ownerId, status: project.status,
        startDate: project.startDate ? jakartaDate(project.startDate) : "", dueDate: project.dueDate ? jakartaDate(project.dueDate) : "", fileUrl: project.fileUrl ?? "",
      }}
    />
  );
}

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">Edit project</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}><Content params={params} /></Suspense>
    </main>
  );
}
