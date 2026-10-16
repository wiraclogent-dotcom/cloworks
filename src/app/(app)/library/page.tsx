import type { Metadata } from "next";
import { Suspense } from "react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadLibrary } from "@/lib/library";
import { LibraryView } from "@/components/library/LibraryView";
import { ProjectsSkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";

/** Tab title: "Library · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Library" };

async function LibraryContent() {
  const { user, db } = await requireScope();
  const data = await loadLibrary(db);
  return (
    <>
      <PageHeader breadcrumb={[{ label: "Tools" }, { label: "Library" }]} title="Library" description="Shared links for the whole workspace." />
      <LibraryView {...data} canManage={can(user.appRole, "library.manage")} now={new Date()} />
    </>
  );
}

export default function LibraryPage() {
  return (
    <div>
      <Suspense fallback={<ProjectsSkeleton />}>
        <LibraryContent />
      </Suspense>
    </div>
  );
}
