import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { NewRequestForm } from "./NewRequestForm";

async function NewRequestContent() {
  const user = await requireUserOrRedirect();
  if (!can(user.appRole, "request.create")) {
    return <p role="alert">You are not allowed to create requests.</p>;
  }
  const [brands, divisions] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.division.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return <NewRequestForm brands={brands} divisions={divisions} />;
}

export default function NewRequestPage() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold">New creative request</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <NewRequestContent />
      </Suspense>
    </div>
  );
}
