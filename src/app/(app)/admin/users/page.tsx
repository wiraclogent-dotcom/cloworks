import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminSkeleton } from "@/components/PageSkeletons";
import { UsersContent } from "./UsersContent";

/** Tab title: "Admin · Users · Creative Tracker" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Admin · Users" };

export default function AdminUsersPage() {
  return (
    <div>
      <Suspense fallback={<AdminSkeleton label="Loading people…" />}>
        <UsersContent />
      </Suspense>
    </div>
  );
}
