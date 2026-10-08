import { Suspense } from "react";
import { UsersContent } from "./UsersContent";

export default function AdminUsersPage() {
  return (
    <main className="mx-auto w-full max-w-[96rem] p-4 sm:p-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <UsersContent />
      </Suspense>
    </main>
  );
}
