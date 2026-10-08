import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSkeleton } from "@/components/PageSkeletons";
import { EditProjectContent } from "../../ProjectFormContent";

export default function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="Edit project" description="Change the project details, dates or file link." />
      <Suspense fallback={<FormSkeleton label="Loading…" header={false} />}><EditProjectContent params={params} /></Suspense>
    </div>
  );
}
