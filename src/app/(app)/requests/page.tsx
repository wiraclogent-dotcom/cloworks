import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listBoardColumns, listRequestsPage } from "@/lib/requests";
import { BOARD_MAX_PER_COLUMN, BOARD_PAGE_SIZE, rangeText, serializeMore } from "@/lib/paging";
import { Board, type BoardColumnView } from "@/components/Board";
import { Pagination } from "@/components/Pagination";
import { RequestTable } from "@/components/RequestTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { BoardSkeleton, TableSkeleton } from "@/components/RequestSkeletons";
import { Plus, SearchX, SquareKanban, Table2 } from "lucide-react";
import { hrefWith, parseParams, toFilter } from "./params";

async function RequestsContent({ searchParams }: { searchParams: PageProps<"/requests">["searchParams"] }) {
  const user = await requireUserOrRedirect();
  const p = parseParams(await searchParams);
  const filter = toFilter(p, user.id);
  const [board, tablePage, brands, divisions, assignees] = await Promise.all([
    p.view === "board" ? listBoardColumns(prisma, filter, { byStatus: p.more }) : null,
    p.view === "table" ? listRequestsPage(prisma, filter, { sort: p.sort, dir: p.dir, page: p.page }) : null,
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.division.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true, appRole: { not: "REQUESTER" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const clearHref = hrefWith({ ...p, status: undefined, assigneeId: undefined, brandId: undefined, divisionId: undefined, q: undefined, motion: undefined, mine: false }, {});
  const filtered = !!(p.status || p.assigneeId || p.brandId || p.divisionId || p.q || p.motion || p.mine);
  return (
    <>
      <PageHeader title="Requests"
        switcher={<SegmentedControl label="View" value={p.view} items={[
          { value: "board", label: "Board", icon: <SquareKanban aria-hidden="true" />, href: hrefWith(p, { view: undefined }) },
          { value: "table", label: "Table", icon: <Table2 aria-hidden="true" />, href: hrefWith(p, { view: "table" }) },
        ]} />}
        actions={<Link href="/requests/new" className={buttonClass({ variant: "primary" })}><Plus aria-hidden="true" />New request</Link>} />
      <div className="mb-4">
        <FilterBar p={p} brands={brands} divisions={divisions} assignees={assignees}
          mineHref={hrefWith(p, { mine: p.mine ? undefined : "1" })}
          clearHref={clearHref} />
      </div>
      {board ? (
        board.every((c) => c.total === 0) && filtered ? (
          <EmptyState icon={<SearchX aria-hidden="true" strokeWidth={1.75} />} title="No requests match these filters."
            description="Try another search or clear the filters."
            action={<Link href={clearHref} className={buttonClass({ variant: "secondary", size: "sm" })}>Clear filters</Link>} />
        ) : (
          <Board canMove={can(user.appRole, "request.transition")} columns={board.map((c): BoardColumnView => {
            const limit = p.more[c.status] ?? BOARD_PAGE_SIZE;
            return {
              ...c,
              moreHref: c.rows.length < c.total && limit < BOARD_MAX_PER_COLUMN
                ? hrefWith(p, { more: serializeMore({ ...p.more, [c.status]: Math.min(BOARD_MAX_PER_COLUMN, limit + BOARD_PAGE_SIZE) }) })
                : null,
              tableHref: hrefWith(p, { view: "table", status: c.status }),
            };
          })} />
        )
      ) : tablePage ? (
        <RequestTable rows={tablePage.rows} sort={p.sort} dir={p.dir}
          hrefFor={(key, dir) => hrefWith(p, { sort: key === "deadline" ? undefined : key, dir: dir === "desc" ? "desc" : undefined })}
          footer={<Pagination text={rangeText(tablePage.window, tablePage.total)} page={tablePage.window.page} pageCount={tablePage.window.pageCount}
            hrefFor={(n) => hrefWith(p, { page: n > 1 ? String(n) : undefined })} />} />
      ) : null}
    </>
  );
}

/** Fallback that matches the requested view: the board skeleton until the params resolve, then board or table. */
async function ViewSkeleton({ searchParams }: { searchParams: PageProps<"/requests">["searchParams"] }) {
  return parseParams(await searchParams).view === "table" ? <TableSkeleton /> : <BoardSkeleton />;
}

export default function RequestsPage({ searchParams }: PageProps<"/requests">) {
  return (
    <div>
      <Suspense fallback={<Suspense fallback={<BoardSkeleton />}><ViewSkeleton searchParams={searchParams} /></Suspense>}>
        <RequestsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
