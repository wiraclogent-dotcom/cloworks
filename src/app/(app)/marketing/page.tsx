import type { Metadata } from "next";
import { Suspense } from "react";
import { MarketingCalendarSkeleton } from "@/components/PageSkeletons";
import { MarketingContent } from "./MarketingContent";

/** Tab title: "Marketing Calendar · Clowork" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Marketing Calendar" };

export default function MarketingCalendarPage({ searchParams }: PageProps<"/marketing">) {
  return (
    <div>
      <Suspense fallback={<MarketingCalendarSkeleton />}>
        <MarketingContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
