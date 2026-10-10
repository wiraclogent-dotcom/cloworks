import type { Metadata } from "next";
import { Suspense } from "react";
import { DetailSkeleton } from "@/components/RequestSkeletons";
import { DetailContent } from "./RequestDetailContent";

/** Generic on purpose: the request title would need a DB read in generateMetadata, outside the page's Suspense/permission flow (cacheComponents). */
export const metadata: Metadata = { title: "Request" };

export default function RequestDetailPage({ params }: PageProps<"/requests/[id]">) {
  return (
    <div data-page-width="medium">
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent params={params} fullPage />
      </Suspense>
    </div>
  );
}
