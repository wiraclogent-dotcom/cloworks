import { Suspense } from "react";
import { UsersContent } from "./UsersContent";

export default function AdminUsersPage() {
  return (
    <div>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <UsersContent />
      </Suspense>
    </div>
  );
}
