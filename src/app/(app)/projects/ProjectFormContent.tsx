import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { Alert } from "@/components/ui/Alert";
import { jakartaDate } from "@/lib/createRequest";
import { ProjectForm } from "./ProjectForm";

/** Shared by the full pages and the intercepted modals so both render the same form. */
export async function NewProjectContent() {
  const user = await requireUserOrRedirect();
  if (!can(user.appRole, "project.manage")) return <Alert tone="danger">You are not allowed to create projects.</Alert>;
  const [brands, owners] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return <ProjectForm brands={brands} owners={owners} initial={{ title: "", subTitle: "", brandId: "", ownerId: user.id, status: "NOT_STARTED", startDate: "", dueDate: "", fileUrl: "" }} />;
}

export async function EditProjectContent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserOrRedirect();
  if (!can(user.appRole, "project.manage")) return <Alert tone="danger">You are not allowed to edit projects.</Alert>;
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
