import type { Metadata } from "next";
import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { NewRequestForm } from "./NewRequestForm";

/** Tab title: "New request · Creative Tracker" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "New request" };

function FormSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <span className="sr-only">Loading…</span>
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <Skeleton className="h-5 w-36" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
      <Skeleton className="h-48 w-full" rounded="xl" />
    </div>
  );
}

async function NewRequestContent() {
  const user = await requireUserOrRedirect();
  if (!can(user.appRole, "request.create")) {
    return <Alert tone="danger">You are not allowed to create requests.</Alert>;
  }
  const [brands, divisions] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.division.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return <NewRequestForm brands={brands} divisions={divisions} />;
}

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
