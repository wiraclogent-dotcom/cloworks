import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/PageSkeletons";
import { WaitlistContent } from "./WaitlistContent";

/** Tab title: "Admin · Waitlist · Clowork" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Admin · Waitlist" };

export default function AdminWaitlistPage() {
  return (
    <div>
      <Suspense fallback={<AdminSkeleton label="Loading waitlist…" />}>
        <WaitlistContent />
      </Suspense>
    </div>
  );
}
