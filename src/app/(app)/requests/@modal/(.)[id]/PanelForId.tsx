import { Suspense } from "react";
import { Maximize2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { DetailSkeleton } from "@/components/RequestSkeletons";
import { DetailContent } from "../../[id]/RequestDetailContent";
import NewRequestPanel from "../(.)new/page";
import { OpenFullPage } from "./OpenFullPage";

/**
 * Both `(.)new` and `(.)[id]` intercept /requests/new, and Next 16.4 builds the interception rewrites in file order
 * (not static-before-dynamic), so `(.)[id]` wins with id "new" and the lookup 404s. Hand that case to the New request
 * panel here instead of relying on the router's ordering.
 */
export async function PanelForId({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "new") return <NewRequestPanel />;
  return (
    <Modal side="right" title="Request" actions={<Suspense fallback={null}><OpenFullPage params={params} icon={<Maximize2 aria-hidden="true" />} /></Suspense>}>
      <Suspense fallback={<DetailSkeleton />}><DetailContent params={params} /></Suspense>
    </Modal>
  );
}
