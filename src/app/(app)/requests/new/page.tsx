import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSkeleton, NewRequestContent } from "./NewRequestContent";

/** Tab title: "New request · Creative Tracker" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "New request" };

export default function NewRequestPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="New request" description="Tell the creative team what you need. Fields marked * are required." />
      <Suspense fallback={<FormSkeleton />}>
        <NewRequestContent />
      </Suspense>
    </div>
  );
}
