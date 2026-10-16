import type { Metadata } from "next";
import { Suspense } from "react";
import { Modal } from "@/components/ui/Modal";
import { FormSkeleton } from "@/components/PageSkeletons";
import { NewProjectContent } from "../../ProjectFormContent";

/** Tab title: "New project · Cloworks" (root layout template). */
export const metadata: Metadata = { title: "New project" };

export default function NewProjectModal() {
  return (
    <Modal title="New project" description="Add a project to the brand timeline.">
      <Suspense fallback={<FormSkeleton label="Loading…" header={false} />}><NewProjectContent /></Suspense>
    </Modal>
  );
}
