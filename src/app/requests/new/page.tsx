import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { parseFieldSchema } from "@/lib/fieldSchema";
import { NewRequestForm } from "./NewRequestForm";

async function NewRequestContent() {
  const user = await requireUser();
  if (!can(user.appRole, "request.create")) {
    return <p role="alert">You are not allowed to create requests.</p>;
  }
  const [brands, divisions, types] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.division.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.requestType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const typeOptions = types.map((t) => ({ id: t.id, name: t.name, fieldSchema: parseFieldSchema(t.fieldSchema) }));
  return <NewRequestForm brands={brands} divisions={divisions} types={typeOptions} />;
}

export default function NewRequestPage() {
  return (
    <main className="mx-auto w-full max-w-xl p-6">
      <h1 className="mb-6 text-2xl font-semibold">New creative request</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <NewRequestContent />
      </Suspense>
    </main>
  );
}
