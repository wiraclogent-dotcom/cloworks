import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/PageSkeletons";
import { ListsContent } from "./ListsContent";

/** Tab title: "Admin · Lists · Creative Tracker" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Admin · Lists" };

export default function AdminListsPage() {
  return (
    <div>
      <Suspense fallback={<AdminSkeleton label="Loading lists…" />}>
        <ListsContent />
      </Suspense>
    </div>
  );
}
