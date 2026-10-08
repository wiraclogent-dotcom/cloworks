import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { NewRequestForm } from "./NewRequestForm";

export function FormSkeleton() {
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

/** Loads the options and renders the form; shared by the full page and the intercepted side panel. */
export async function NewRequestContent() {
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
