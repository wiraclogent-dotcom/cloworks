import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { listBoardColumns, listCalendarRequests, listRequestsPage, listTimelineRequests } from "@/lib/requests";
import { BOARD_MAX_PER_COLUMN, BOARD_PAGE_SIZE, rangeText, serializeMore } from "@/lib/paging";
import { Board, type BoardColumnView } from "@/components/Board";
import { Pagination } from "@/components/Pagination";
import { RequestCalendar } from "@/components/RequestCalendar";
import { RequestTimeline } from "@/components/RequestTimeline";
import { TodayOverview } from "@/components/TodayOverview";
import { RequestTable } from "@/components/RequestTable";
import { FilterBar } from "@/components/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { BoardSkeleton, CalendarSkeleton, TableSkeleton, TimelineSkeleton } from "@/components/RequestSkeletons";
import { Bell, CalendarDays, ChartNoAxesGantt, Plus, SearchX, Settings, SquareKanban, Table2 } from "lucide-react";
import { AvatarStack } from "@/components/ui/Avatar";
import { buildMonthGrid, shiftMonth } from "@/lib/calendar";
import { buildWindow, shiftWeek } from "@/lib/workload";
import { jakartaDate } from "@/lib/createRequest";
import { todayOverview } from "@/lib/todayOverview";
import { hrefWith, parseParams, parseView, toFilter, type ViewParams } from "./params";

/** Today's counts and the welcome card: its own Suspense boundary, so the board is not held up by it. */
async function TodayLoader() {
  const user = await requireUserOrRedirect();
  const now = new Date();
  const [me, overview] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }),
    todayOverview(prisma, now),
  ]);
  return <TodayOverview name={me?.name ?? ""} now={now} overview={overview} />;
}

/** Tab title: "Requests · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Requests" };

async function RequestsContent({ searchParams }: { searchParams: PageProps<"/requests">["searchParams"] }) {
  const user = await requireUserOrRedirect();
  const parsed = parseParams(await searchParams);
  // The calendar and timeline show open work only: a closed status from the URL is ignored there (query, filter bar and "filtered" flag).
  const p = (parsed.view === "calendar" || parsed.view === "timeline") && (parsed.status === "DONE" || parsed.status === "CANCELLED") ? { ...parsed, status: undefined } : parsed;
  const filter = toFilter(p, user.id);
  const today = jakartaDate(new Date());
  const grid = p.view === "calendar" ? buildMonthGrid(p.month, today) : null;
  const tlWindow = p.view === "timeline" ? buildWindow(p.week, today) : null;
  const [board, tablePage, calendarRows, timelineRows, brands, divisions, assignees] = await Promise.all([
    p.view === "board" ? listBoardColumns(prisma, filter, { byStatus: p.more }) : null,
    p.view === "table" ? listRequestsPage(prisma, filter, { sort: p.sort, dir: p.dir, page: p.page }) : null,
    grid ? listCalendarRequests(prisma, filter, { from: grid.from, to: grid.to, today }) : null,
    tlWindow ? listTimelineRequests(prisma, filter, { from: tlWindow.from, to: tlWindow.to, today }) : null,
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.division.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { active: true, appRole: { not: "REQUESTER" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const clearHref = hrefWith({ ...p, status: undefined, assigneeId: undefined, brandId: undefined, divisionId: undefined, q: undefined, motion: undefined, mine: false }, {});
  const filtered = !!(p.status || p.assigneeId || p.brandId || p.divisionId || p.q || p.motion || p.mine);
  return (
    <>
      <PageHeader title="Requests"
        breadcrumb={[{ label: "Work" }, { label: "Requests", href: "/requests" }, { label: VIEW_LABEL[p.view] }]}
        topBarActions={<>
          <AvatarStack names={assignees.map((a) => a.name)} max={4} size="sm" label="Team" />
          <ComingSoon label="Notifications" icon={<Bell aria-hidden="true" />} />
          <ComingSoon label="Settings" icon={<Settings aria-hidden="true" />} />
        </>}
        actions={<Link href="/requests/new" className={buttonClass({ variant: "primary" })}><Plus aria-hidden="true" />New request</Link>} />
      {p.view === "board" ? (
        <Suspense fallback={<div aria-hidden="true" className="mb-4 h-28 rounded-xl bg-surface-muted" />}><TodayLoader /></Suspense>
      ) : null}
      {/* One toolbar row: the view switcher, then the filters (they wrap under it on narrow screens). */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
        <SegmentedControl label="View" value={p.view} className="max-w-full overflow-x-auto" items={[
          { value: "board", label: "Board", icon: <SquareKanban aria-hidden="true" />, href: hrefWith(p, { view: undefined }) },
          { value: "table", label: "Table", icon: <Table2 aria-hidden="true" />, href: hrefWith(p, { view: "table" }) },
          { value: "calendar", label: "Calendar", icon: <CalendarDays aria-hidden="true" />, href: hrefWith(p, { view: "calendar" }) },
          { value: "timeline", label: "Timeline", icon: <ChartNoAxesGantt aria-hidden="true" />, href: hrefWith(p, { view: "timeline" }) },
        ]} />
        <div className="ml-auto">
          <FilterBar p={p} brands={brands} divisions={divisions} assignees={assignees}
            mineHref={hrefWith(p, { mine: p.mine ? undefined : "1" })}
            clearHref={clearHref} />
        </div>
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
      ) : calendarRows ? (
        <RequestCalendar rows={calendarRows} month={p.month} today={today} canMove={can(user.appRole, "request.transition")}
          filtered={filtered} clearHref={clearHref}
          prevHref={hrefWith(p, { month: shiftMonth(p.month, -1) })} nextHref={hrefWith(p, { month: shiftMonth(p.month, 1) })}
          todayHref={hrefWith(p, { month: today.slice(0, 7) })} />
      ) : timelineRows ? (
        <RequestTimeline rows={timelineRows} people={assignees} week={p.week} today={today} assigneeId={p.assigneeId}
          filtered={filtered} clearHref={clearHref}
          prevHref={hrefWith(p, { week: shiftWeek(p.week, -1) })} nextHref={hrefWith(p, { week: shiftWeek(p.week, 1) })}
          todayHref={hrefWith(p, { week: undefined })} />
      ) : null}
    </>
  );
}

const VIEW_LABEL: Record<ViewParams["view"], string> = { board: "Board", table: "Table", calendar: "Calendar", timeline: "Timeline" };

/** Top-bar icon button for a feature that does not exist yet: visible, labelled, and disabled (no fake action). */
function ComingSoon({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <button type="button" disabled aria-label={`${label} (coming soon)`} title={`${label}: coming soon`}
      className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground-secondary disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4">
      {icon}
    </button>
  );
}

/** Fallback that matches the requested view: the board skeleton until the params resolve, then board, table, calendar or timeline. */
async function ViewSkeleton({ searchParams }: { searchParams: PageProps<"/requests">["searchParams"] }) {
  const view = parseView((await searchParams).view);
  return view === "table" ? <TableSkeleton /> : view === "calendar" ? <CalendarSkeleton /> : view === "timeline" ? <TimelineSkeleton /> : <BoardSkeleton />;
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
