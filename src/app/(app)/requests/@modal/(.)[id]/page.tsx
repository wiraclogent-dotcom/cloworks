import { Suspense } from "react";
import { Maximize2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { DetailSkeleton } from "@/components/RequestSkeletons";
import { DetailContent } from "../../[id]/RequestDetailContent";
import { OpenFullPage } from "./OpenFullPage";

export default function RequestPanel({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Modal side="right" title="Request" actions={<Suspense fallback={null}><OpenFullPage params={params} icon={<Maximize2 aria-hidden="true" />} /></Suspense>}>
      <Suspense fallback={<DetailSkeleton />}><DetailContent params={params} /></Suspense>
    </Modal>
  );
}
