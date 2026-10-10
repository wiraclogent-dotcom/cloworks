import type { Metadata } from "next";
import { Suspense } from "react";
import { BriefCalendarSkeleton } from "@/components/PageSkeletons";
import { BriefContent } from "./BriefContent";

/** Tab title: "Brief Calendar · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Brief Calendar" };

export default function BriefCalendarPage({ searchParams }: PageProps<"/dashboard/briefs">) {
  return (
    <div>
      <Suspense fallback={<BriefCalendarSkeleton />}>
        <BriefContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
