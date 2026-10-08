import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listRequests, sortRows } from "@/lib/requests";
import { Board } from "@/components/Board";
import { RequestTable } from "@/components/RequestTable";
import { FilterBar } from "@/components/FilterBar";
import { hrefWith, parseParams, toFilter } from "./params";

async function RequestsContent({ searchParams }: { searchParams: PageProps<"/requests">["searchParams"] }) {
  const user = await requireUser();
  const p = parseParams(await searchParams);
  const [rows, brands, divisions, assignees] = await Promise.all([
    listRequests(prisma, toFilter(p, user.id)),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.division.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true, appRole: { not: "REQUESTER" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const tab = (view: "board" | "table", label: string) => (
    <Link href={hrefWith(p, { view: view === "table" ? "table" : undefined })} aria-current={p.view === view ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring ${p.view === view ? "bg-secondary text-secondary-foreground" : "border border-border"}`}>
      {label}
    </Link>
  );
  const filtered = !!(p.status || p.assigneeId || p.brandId || p.divisionId || p.q || p.mine);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Requests</h1>
        <nav aria-label="View" className="ml-auto flex gap-2">{tab("board", "Board")}{tab("table", "Table")}</nav>
      </div>
      <div className="mb-4">
        <FilterBar p={p} brands={brands} divisions={divisions} assignees={assignees}
          mineHref={hrefWith(p, { mine: p.mine ? undefined : "1" })}
          clearHref={hrefWith({ ...p, status: undefined, assigneeId: undefined, brandId: undefined, divisionId: undefined, q: undefined, mine: false }, {})} />
      </div>
      {rows.length === 0 && p.view === "board" && filtered ? (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-muted-foreground">No requests match these filters.</p>
      ) : p.view === "board" ? (
        <Board requests={rows} canMove={can(user.appRole, "request.transition")} showCancelled={p.status === "CANCELLED"} />
      ) : (
        <RequestTable rows={sortRows(rows, p.sort, p.dir)} sort={p.sort} dir={p.dir}
          hrefFor={(key, dir) => hrefWith(p, { sort: key === "deadline" ? undefined : key, dir: dir === "desc" ? "desc" : undefined })} />
      )}
    </>
  );
}

export default function RequestsPage({ searchParams }: PageProps<"/requests">) {
  return (
    <main className="mx-auto w-full max-w-[96rem] p-4 sm:p-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading requests…</p>}>
        <RequestsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
