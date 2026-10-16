import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/PageSkeletons";
import { AddPersonContent } from "./AddPersonContent";

/** Tab title: "Admin · Add person · Clowork" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Admin · Add person" };

export default function AdminAddPersonPage() {
  return (
    <div>
      <Suspense fallback={<AdminSkeleton label="Loading…" />}>
        <AddPersonContent />
      </Suspense>
    </div>
  );
}
