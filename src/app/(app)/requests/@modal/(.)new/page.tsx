import { Suspense } from "react";
import { Modal } from "@/components/ui/Modal";
import { FormSkeleton, NewRequestContent } from "../../new/NewRequestContent";

/**
 * Static match, so it wins over `(.)[id]` (which would otherwise treat "new" as a request id and 404).
 * The form posts and redirects to /requests, which the slot's page.tsx renders as "no panel".
 */
export default function NewRequestPanel() {
  return (
    <Modal side="right" title="New request">
      <p className="mb-4 text-sm text-foreground-secondary">Tell the creative team what you need. Fields marked * are required.</p>
      <Suspense fallback={<FormSkeleton />}><NewRequestContent /></Suspense>
    </Modal>
  );
}
