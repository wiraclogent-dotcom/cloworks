import { Suspense } from "react";
import { AdminSkeleton } from "@/components/PageSkeletons";
import { UsersContent } from "./UsersContent";

export default function AdminUsersPage() {
  return (
    <div>
      <Suspense fallback={<AdminSkeleton label="Loading people…" />}>
        <UsersContent />
      </Suspense>
    </div>
  );
}
