import type { Metadata } from "next";
import { Suspense } from "react";
import { TeamKpiSkeleton } from "@/components/PageSkeletons";
import { TeamContent } from "./TeamContent";

/** Tab title: "Team KPI · Clowork" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Team KPI" };

export default function TeamKpiPage({ searchParams }: PageProps<"/dashboard/team">) {
  return (
    <div>
      <Suspense fallback={<TeamKpiSkeleton />}>
        <TeamContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
