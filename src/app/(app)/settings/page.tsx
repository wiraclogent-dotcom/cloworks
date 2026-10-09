import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { SettingsContent } from "./SettingsContent";

/** Tab title: "Settings · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Settings" };

/** The per-user content streams in a Suspense boundary (cacheComponents), like the other app pages. */
export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader breadcrumb={[{ label: "Settings" }]} title="Settings" description="Your account and how Cloworks looks for you." />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-56 w-full" rounded="xl" />
      <Skeleton className="h-24 w-full" rounded="xl" />
    </div>
  );
}
