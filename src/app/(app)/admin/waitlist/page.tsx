import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/PageSkeletons";
import { WaitlistContent } from "./WaitlistContent";

/**
 * Tab title "Admin · Clowork" and a generic loading label: a workspace admin who is not a platform admin gets a 404
 * here, and neither the title nor the skeleton may tell them a waitlist page exists.
 */
export const metadata: Metadata = { title: "Admin" };

export default function AdminWaitlistPage() {
  return (
    <div>
      <Suspense fallback={<AdminSkeleton label="Loading…" />}>
        <WaitlistContent />
      </Suspense>
    </div>
  );
}
