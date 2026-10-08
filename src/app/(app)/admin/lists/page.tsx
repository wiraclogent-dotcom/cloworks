import { Suspense } from "react";
import { AdminSkeleton } from "@/components/PageSkeletons";
import { ListsContent } from "./ListsContent";

export default function AdminListsPage() {
  return (
    <div>
      <Suspense fallback={<AdminSkeleton label="Loading lists…" />}>
        <ListsContent />
      </Suspense>
    </div>
  );
}
