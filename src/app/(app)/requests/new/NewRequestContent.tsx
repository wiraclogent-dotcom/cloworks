import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { Card } from "@/components/shadcn/card";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Skeleton } from "@/components/shadcn/skeleton";
import { listCreativeTeam } from "@/lib/team";
import { NewRequestForm } from "./NewRequestForm";

export function FormSkeleton() {
  return (
    <div role="status" aria-busy="true" className="@container"><div className="grid gap-5 @3xl:grid-cols-[minmax(0,1fr)_20rem]">
      <span className="sr-only">Loading…</span>
      <Card className="space-y-4">
        <Skeleton className="h-5 w-36" />
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
      </Card>
      <Skeleton className="h-48 w-full rounded-xl" />
    </div></div>
  );
}

/** Loads the options and renders the form; shared by the full page and the intercepted side panel. */
export async function NewRequestContent() {
  const { user, db } = await requireScope();
  if (!can(user.appRole, "request.create")) {
    return <Alert variant="destructive"><AlertDescription>You are not allowed to create requests.</AlertDescription></Alert>;
  }
  const [brands, divisions, team] = await Promise.all([
    db.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.division.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    listCreativeTeam(db),
  ]);
  return <NewRequestForm brands={brands} divisions={divisions} assignees={team} />;
}
