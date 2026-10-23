import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { isPlatformAdminUser } from "@/lib/platformAdmin";
import { brandUsage, divisionUsage, typeUsage } from "@/lib/admin";
import { parseFieldSchema } from "@/lib/fieldSchema";
import { cn, focusRing } from "@/components/ui/cn";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/shadcn/collapsible";
import { AdminDenied } from "../AdminDenied";
import { SettingsTabs } from "../../settings/SettingsTabs";
import { BrandColourButton, ListRowActions, NameForm, TypeForm } from "./ListForms";

const usageLine = (text: string) => <p className="text-xs text-muted-foreground">{text || "Not used yet"}</p>;

/** Archived rows of a list, closed until opened: they're out of the way but can be restored (or deleted when unused). */
function ArchivedGroup({ count, children }: { count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <Collapsible className="group mt-4 border-t border-border pt-3">
      <CollapsibleTrigger className={cn("flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground", focusRing)}>
        <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 transition-transform duration-150 group-data-[state=open]:rotate-90" />
        Archived ({count})
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Settings › Lists (spec 2026-10-23): brands, divisions and request types with what uses each, Archive / Restore, Delete
 * for unused items, brand colours and the request type field editor.
 */
export async function ListsContent() {
  const { user: viewer, db } = await requireScope();
  if (!can(viewer.appRole, "admin.manage")) return <AdminDenied />;

  const [brands, divisions, types] = await Promise.all([
    db.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, archivedAt: true, _count: { select: { requests: true, projects: true, libraryItems: true, socialChannels: true } } },
    }),
    db.division.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, archivedAt: true, _count: { select: { requests: true, marketingActivities: true } } } }),
    db.requestType.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, active: true, fieldSchema: true, _count: { select: { requests: true, contentPosts: true } } } }),
  ]);

  const brandRow = (b: (typeof brands)[number]) => {
    const used = brandUsage(b._count);
    return (
      <li key={b.id} className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <BrandColourButton id={b.id} name={b.name} color={b.color} />
        <div className="min-w-0 flex-1">
          <NameForm kind="brand" id={b.id} name={b.name} />
          {usageLine(used)}
        </div>
        <ListRowActions kind="brand" id={b.id} name={b.name} archived={b.archivedAt !== null} deletable={!used} />
      </li>
    );
  };
  const divisionRow = (d: (typeof divisions)[number]) => {
    const used = divisionUsage(d._count);
    return (
      <li key={d.id} className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1">
          <NameForm kind="division" id={d.id} name={d.name} />
          {usageLine(used)}
        </div>
        <ListRowActions kind="division" id={d.id} name={d.name} archived={d.archivedAt !== null} deletable={!used} />
      </li>
    );
  };
  const typeRow = (t: (typeof types)[number]) => {
    const used = typeUsage(t._count);
    return (
      <li key={t.id} className="rounded-lg border border-border">
        <Collapsible className="group">
          <div className="flex items-center gap-2 pr-2">
            <CollapsibleTrigger className={cn("flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left font-medium text-foreground hover:bg-muted", focusRing)}>
              <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-90" />
              <span className="truncate">{t.name}</span>
              {!t.active ? <><span className="sr-only"> · </span><Badge tone="tag-neutral">Archived</Badge></> : null}
              <span className="ml-auto hidden text-xs font-normal text-muted-foreground sm:inline">{used || "Not used yet"}</span>
            </CollapsibleTrigger>
            <ListRowActions kind="type" id={t.id} name={t.name} archived={!t.active} deletable={!used} />
          </div>
          <CollapsibleContent keepMounted className="border-t border-border p-3">
            <TypeForm t={{ id: t.id, name: t.name, schema: parseFieldSchema(t.fieldSchema), requests: t._count.requests }} />
          </CollapsibleContent>
        </Collapsible>
      </li>
    );
  };

  const activeBrands = brands.filter((b) => !b.archivedAt), archivedBrands = brands.filter((b) => b.archivedAt);
  const activeDivisions = divisions.filter((d) => !d.archivedAt), archivedDivisions = divisions.filter((d) => d.archivedAt);
  const activeTypes = types.filter((t) => t.active), archivedTypes = types.filter((t) => !t.active);

  return (
    <>
      <PageHeader breadcrumb={[{ label: "Settings", href: "/settings" }, { label: "Lists" }]} title="Brands, divisions and request types" switcher={<SettingsTabs current="lists" admin waitlist={await isPlatformAdminUser(db, viewer.id)} />}
        description="Brands, divisions and request types used across Clowork. Archive what you no longer use: it disappears from new forms, and old work keeps its name." />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <section aria-labelledby="brands-h">
            <CardHeader><CardTitle id="brands-h">Brands</CardTitle></CardHeader>
            <p className="mb-3 text-sm text-muted-foreground">Shown on requests, projects, Content Plan channels and Library items.</p>
            <ul className="mb-4 space-y-3">{activeBrands.map(brandRow)}</ul>
            <div className="border-t border-border pt-4"><NameForm kind="brand" /></div>
            <ArchivedGroup count={archivedBrands.length}><ul className="space-y-3">{archivedBrands.map(brandRow)}</ul></ArchivedGroup>
          </section>
        </Card>
        <Card>
          <section aria-labelledby="divisions-h">
            <CardHeader><CardTitle id="divisions-h">Divisions</CardTitle></CardHeader>
            <p className="mb-3 text-sm text-muted-foreground">
              The team a request comes from. Calendar lanes, colours and leads are in <Link href="/admin/calendar" className={cn("font-medium text-link underline-offset-2 hover:underline", focusRing)}>Settings › Marketing calendar</Link>.
            </p>
            <ul className="mb-4 space-y-3">{activeDivisions.map(divisionRow)}</ul>
            <div className="border-t border-border pt-4"><NameForm kind="division" /></div>
            <ArchivedGroup count={archivedDivisions.length}><ul className="space-y-3">{archivedDivisions.map(divisionRow)}</ul></ArchivedGroup>
          </section>
        </Card>
      </div>

      <Card className="mt-5">
        <section aria-labelledby="types-h">
          <CardHeader><CardTitle id="types-h">Request types</CardTitle></CardHeader>
          <p className="mb-3 text-sm text-muted-foreground">What people can ask for. A type can ask extra questions on the new request form.</p>
          <ul className="mb-6 space-y-2">{activeTypes.map(typeRow)}</ul>
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 text-base font-semibold text-foreground">Add request type</h3>
            <TypeForm />
          </div>
          <ArchivedGroup count={archivedTypes.length}><ul className="space-y-2">{archivedTypes.map(typeRow)}</ul></ArchivedGroup>
        </section>
      </Card>
    </>
  );
}
