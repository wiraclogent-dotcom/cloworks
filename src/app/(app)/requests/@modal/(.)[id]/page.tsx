import type { Metadata } from "next";
import { Suspense } from "react";
import { Maximize2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { DetailSkeleton } from "@/components/RequestSkeletons";
import { DetailContent } from "../../[id]/RequestDetailContent";
import { OpenFullPage } from "./OpenFullPage";
import { stripInterceptionMarkers } from "@/lib/interceptedParam";

/** Same tab title as the full page ("Request · Cloworks"); without it the panel left just "Cloworks". */
export const metadata: Metadata = { title: "Request" };

export default function RequestPanel({ params: raw }: { params: Promise<{ id: string }> }) {
  // Dev-only Next bug: the intercepted id can arrive as "(.)<id>"; see stripInterceptionMarkers.
  const params = raw.then((p) => ({ ...p, id: stripInterceptionMarkers(p.id) }));
  return (
    <Modal side="right" title="Request" actions={<Suspense fallback={null}><OpenFullPage params={params} icon={<Maximize2 aria-hidden="true" />} /></Suspense>}>
      <Suspense fallback={<DetailSkeleton />}><DetailContent params={params} /></Suspense>
    </Modal>
  );
}
