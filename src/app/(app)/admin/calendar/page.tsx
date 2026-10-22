import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/PageSkeletons";
import { CalendarContent } from "./CalendarContent";

/** Tab title: "Admin · Marketing calendar · Clowork" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Admin · Marketing calendar" };

export default function AdminCalendarPage() {
  return (
    <div>
      <Suspense fallback={<AdminSkeleton label="Loading calendar settings…" />}>
        <CalendarContent />
      </Suspense>
    </div>
  );
}
