import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { FormSkeleton } from "@/components/PageSkeletons";
import { ProjectForm } from "../ProjectForm";

async function Content() {
  const user = await requireUserOrRedirect();
  if (!can(user.appRole, "project.manage")) return <Alert tone="danger">You are not allowed to create projects.</Alert>;
  const [brands, owners] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return <ProjectForm brands={brands} owners={owners} initial={{ title: "", subTitle: "", brandId: "", ownerId: user.id, status: "NOT_STARTED", startDate: "", dueDate: "", fileUrl: "" }} />;
}

export default function NewProjectPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="New project" description="Add a project to the brand timeline." />
      <Suspense fallback={<FormSkeleton label="Loading…" header={false} />}><Content /></Suspense>
    </div>
  );
}
