import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { AdminDenied } from "../AdminDenied";
import { AdminTabs } from "../AdminTabs";
import { NameForm, TypeForm } from "./ListForms";

export async function ListsContent() {
  const viewer = await requireUser();
  if (!can(viewer.appRole, "admin.manage")) return <AdminDenied />;

  const [brands, divisions, types] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
    prisma.division.findMany({ orderBy: { name: "asc" } }),
    prisma.requestType.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <AdminTabs current="lists" />
      <h1 className="mb-4 text-2xl font-semibold">Brands, divisions and request types</h1>
      <p className="mb-6 text-muted-foreground">Nothing here can be deleted; deactivate a request type to hide it from the new request form.</p>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="brands-h">
          <h2 id="brands-h" className="mb-2 text-lg font-semibold">Brands</h2>
          <ul className="mb-4 space-y-3">
            {brands.map((b) => <li key={b.id}><NameForm kind="brand" id={b.id} name={b.name} /></li>)}
          </ul>
          <NameForm kind="brand" />
        </section>
        <section aria-labelledby="divisions-h">
          <h2 id="divisions-h" className="mb-2 text-lg font-semibold">Divisions</h2>
          <ul className="mb-4 space-y-3">
            {divisions.map((d) => <li key={d.id}><NameForm kind="division" id={d.id} name={d.name} /></li>)}
          </ul>
          <NameForm kind="division" />
        </section>
      </div>

      <section aria-labelledby="types-h" className="mt-8 max-w-3xl">
        <h2 id="types-h" className="mb-2 text-lg font-semibold">Request types</h2>
        <ul className="mb-6 space-y-3">
          {types.map((t) => (
            <li key={t.id} className="rounded-md border border-border p-3">
              <details>
                <summary className="cursor-pointer font-medium focus-visible:outline-2 focus-visible:outline-ring">
                  {t.name} · {t.active ? "Active" : "Inactive"}
                </summary>
                <div className="mt-3">
                  <TypeForm t={{ id: t.id, name: t.name, active: t.active, schemaText: JSON.stringify(t.fieldSchema, null, 2) }} />
                </div>
              </details>
            </li>
          ))}
        </ul>
        <h3 className="mb-2 font-semibold">Add request type</h3>
        <TypeForm />
      </section>
    </>
  );
}
