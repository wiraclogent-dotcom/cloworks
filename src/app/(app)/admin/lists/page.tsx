import { Suspense } from "react";
import { ListsContent } from "./ListsContent";

export default function AdminListsPage() {
  return (
    <div>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <ListsContent />
      </Suspense>
    </div>
  );
}
