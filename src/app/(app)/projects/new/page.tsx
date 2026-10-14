import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSkeleton } from "@/components/PageSkeletons";
import { NewProjectContent } from "../ProjectFormContent";

/** Tab title: "New project · Cloworks" (root layout template). */
export const metadata: Metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <div>
      <PageHeader breadcrumb={[{ label: "Work" }, { label: "Projects", href: "/projects" }, { label: "New project" }]} title="New project" description="Add a project to the brand timeline." />
      <div className="max-w-3xl"><Suspense fallback={<FormSkeleton label="Loading…" header={false} />}><NewProjectContent /></Suspense></div>
    </div>
  );
}
