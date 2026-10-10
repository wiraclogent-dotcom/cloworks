import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { NotificationsContent } from "./NotificationsContent";

/** Tab title: "Notifications · Cloworks". Opened from "See all notifications" in the top-bar bell (no sidebar link). */
export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  return (
    <div data-page-width="narrow">
      <PageHeader breadcrumb={[{ label: "Notifications" }]} title="Notifications" description="Comments, mentions, assignments and design updates on your requests." />
      <Suspense fallback={<NotificationsSkeleton />}>
        <NotificationsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function NotificationsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-2">
      <span className="sr-only">Loading…</span>
      {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" rounded="xl" />)}
    </div>
  );
}
