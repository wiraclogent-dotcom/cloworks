import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { ArticleContent } from "./ArticleContent";

/**
 * Generic tab title. A per-user read in generateMetadata would break the build under cacheComponents (see
 * requests/[id]), so a guide's own title only appears in the page heading, never in metadata.
 */
export const metadata: Metadata = { title: "Help" };

export default function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <div data-page-width="medium">
      <Suspense fallback={<ArticleSkeleton />}>
        <ArticleContent params={params} />
      </Suspense>
    </div>
  );
}

function ArticleSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-64 w-full" rounded="xl" />
    </div>
  );
}
