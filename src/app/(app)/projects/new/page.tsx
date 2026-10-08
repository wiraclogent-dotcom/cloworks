import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ProjectForm } from "../ProjectForm";

async function Content() {
  const user = await requireUser();
  if (!can(user.appRole, "project.manage")) return <p role="alert">You are not allowed to create projects.</p>;
  const [brands, owners] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return <ProjectForm brands={brands} owners={owners} initial={{ title: "", subTitle: "", brandId: "", ownerId: user.id, status: "NOT_STARTED", startDate: "", dueDate: "", fileUrl: "" }} />;
}

export default function NewProjectPage() {
  return (
    <main className="mx-auto w-full max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">New project</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}><Content /></Suspense>
    </main>
  );
}
