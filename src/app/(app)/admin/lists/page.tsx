import { Suspense } from "react";
import { ListsContent } from "./ListsContent";

export default function AdminListsPage() {
  return (
    <main className="mx-auto w-full max-w-[96rem] p-4 sm:p-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <ListsContent />
      </Suspense>
    </main>
  );
}
