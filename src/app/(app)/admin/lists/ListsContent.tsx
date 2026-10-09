import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { AdminDenied } from "../AdminDenied";
import { AdminTabs } from "../AdminTabs";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { activeChip } from "@/lib/adminChips";
import { NameForm, TypeForm } from "./ListForms";

export async function ListsContent() {
  const { user: viewer, db } = await requireScope();
  if (!can(viewer.appRole, "admin.manage")) return <AdminDenied />;

  const [brands, divisions, types] = await Promise.all([
    db.brand.findMany({ orderBy: { name: "asc" } }),
    db.division.findMany({ orderBy: { name: "asc" } }),
    db.requestType.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <PageHeader breadcrumb={[{ label: "Admin" }, { label: "Lists" }]} title="Brands, divisions and request types" switcher={<AdminTabs current="lists" />}
        description="Nothing here can be deleted; deactivate a request type to hide it from the new request form." />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <section aria-labelledby="brands-h">
            <CardHeader><CardTitle id="brands-h">Brands</CardTitle></CardHeader>
            <ul className="mb-4 space-y-2">
              {brands.map((b) => <li key={b.id}><NameForm kind="brand" id={b.id} name={b.name} /></li>)}
            </ul>
            <div className="border-t border-border pt-4"><NameForm kind="brand" /></div>
          </section>
        </Card>
        <Card>
          <section aria-labelledby="divisions-h">
            <CardHeader><CardTitle id="divisions-h">Divisions</CardTitle></CardHeader>
            <ul className="mb-4 space-y-2">
              {divisions.map((d) => <li key={d.id}><NameForm kind="division" id={d.id} name={d.name} /></li>)}
            </ul>
            <div className="border-t border-border pt-4"><NameForm kind="division" /></div>
          </section>
        </Card>
      </div>

      <Card className="mt-4">
        <section aria-labelledby="types-h">
          <CardHeader><CardTitle id="types-h">Request types</CardTitle></CardHeader>
          <ul className="mb-6 space-y-2">
            {types.map((t) => {
              const chip = activeChip(t.active);
              return (
                <li key={t.id} className="rounded-lg border border-border">
                  <details className="group">
                    <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 font-medium text-foreground hover:bg-surface-muted">
                      <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 text-foreground-secondary transition-transform duration-150 group-open:rotate-90" />
                      {t.name}
                      <span className="sr-only"> · </span>
                      <Chip tone={chip.tone}>{chip.label}</Chip>
                    </summary>
                    <div className="border-t border-border p-3">
                      <TypeForm t={{ id: t.id, name: t.name, active: t.active, schemaText: JSON.stringify(t.fieldSchema, null, 2) }} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 text-[15px] font-semibold text-foreground">Add request type</h3>
            <TypeForm />
          </div>
        </section>
      </Card>
    </>
  );
}
