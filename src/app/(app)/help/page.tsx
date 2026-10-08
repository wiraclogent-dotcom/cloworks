import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { HelpContent } from "./HelpContent";

/** Tab title: "Help · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Help" };

/** The per-user list streams in a Suspense boundary (cacheComponents), like the other app pages. */
export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help" description="Short guides for the parts of Cloworks you can use." />
      <Suspense fallback={<HelpSkeleton />}>
        <HelpContent />
      </Suspense>
    </>
  );
}

function HelpSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-40 w-full" rounded="xl" />
    </div>
  );
}
