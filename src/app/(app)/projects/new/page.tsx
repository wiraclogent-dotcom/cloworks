import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSkeleton } from "@/components/PageSkeletons";
import { NewProjectContent } from "../ProjectFormContent";

export default function NewProjectPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader breadcrumb={[{ label: "Work" }, { label: "Projects", href: "/projects" }, { label: "New project" }]} title="New project" description="Add a project to the brand timeline." />
      <Suspense fallback={<FormSkeleton label="Loading…" header={false} />}><NewProjectContent /></Suspense>
    </div>
  );
}
