import type { Metadata } from "next";
import { Suspense } from "react";
import { Modal } from "@/components/ui/Modal";
import { FormSkeleton } from "@/components/PageSkeletons";
import { EditProjectContent } from "../../../ProjectFormContent";

/** Tab title: "Edit project · Cloworks" (root layout template). */
export const metadata: Metadata = { title: "Edit project" };

export default function EditProjectModal({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Modal title="Edit project" description="Change the project details, dates or file link.">
      <Suspense fallback={<FormSkeleton label="Loading…" header={false} />}><EditProjectContent params={params} /></Suspense>
    </Modal>
  );
}
