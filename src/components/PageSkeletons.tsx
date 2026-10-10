import { Busy } from "./RequestSkeletons";
import { Skeleton } from "./ui/Skeleton";
import { cn } from "./ui/cn";

/** Page title + header actions placeholder (PageHeader shape). */
function HeaderSkeleton({ actions = 1 }: { actions?: number }) {
  return (
    <div className="mb-5 flex items-center gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="ml-auto flex gap-2">
        {Array.from({ length: actions }, (_, i) => <Skeleton key={i} className="h-9 w-36" rounded="full" />)}
      </div>
    </div>
  );
}

function TileSkeleton() {
  return (
    <div data-skeleton-tile="" className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <Skeleton className="size-10" rounded="xl" />
      <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-7 w-16" /></div>
    </div>
  );
}

function CardSkeleton({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-xl border border-border bg-card p-4 shadow-card", className)}>{children}</div>;
}

function TableRowsSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <CardSkeleton className="space-y-3">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} data-skeleton-row="" className="flex items-center gap-3">
          <Skeleton className="size-7" rounded="full" />
          {Array.from({ length: cols }, (_, c) => <Skeleton key={c} className={cn("h-4", c === 0 ? "w-40" : "flex-1")} />)}
        </div>
      ))}
    </CardSkeleton>
  );
}

/** My KPI fallback: header, 8 tiles, target card, chart card. */
export function KpiSkeleton() {
  return (
    <Busy label="Loading KPI…">
      <HeaderSkeleton />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <TileSkeleton key={i} />)}
      </div>
      <CardSkeleton className="mb-4 space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-3 w-full" rounded="full" /></CardSkeleton>
      <CardSkeleton><Skeleton className="h-5 w-40" /><Skeleton className="mt-4 h-56 w-full" /></CardSkeleton>
    </Busy>
  );
}

/** Team KPI fallback: header, 3 summary tiles, table card. */
export function TeamKpiSkeleton() {
  return (
    <Busy label="Loading team KPI…">
      <HeaderSkeleton />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <TileSkeleton key={i} />)}
      </div>
      <TableRowsSkeleton rows={6} cols={6} />
    </Busy>
  );
}

/** Brief Calendar fallback: header, 3 person tiles, month grid card. */
export function BriefCalendarSkeleton() {
  return (
    <Busy label="Loading brief calendar…">
      <HeaderSkeleton />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <TileSkeleton key={i} />)}
      </div>
      <CardSkeleton className="mb-4"><Skeleton className="h-32 w-full" /></CardSkeleton>
      <CardSkeleton><Skeleton className="h-96 w-full" /></CardSkeleton>
    </Busy>
  );
}

/** Projects fallback: header, grouped table card, timeline card. */
export function ProjectsSkeleton() {
  return (
    <Busy label="Loading projects…">
      <HeaderSkeleton />
      <TableRowsSkeleton rows={6} cols={5} />
      <CardSkeleton className="mt-4"><Skeleton className="h-5 w-32" /><Skeleton className="mt-4 h-40 w-full" /></CardSkeleton>
    </Busy>
  );
}

/** Admin fallback: header with the section switch, a table card and a form card. */
export function AdminSkeleton({ label = "Loading admin…" }: { label?: string }) {
  return (
    <Busy label={label}>
      <HeaderSkeleton />
      <TableRowsSkeleton rows={5} cols={4} />
      <CardSkeleton className="mt-4 space-y-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-2/3" /></CardSkeleton>
    </Busy>
  );
}

/** Form pages (new / edit project): header + one card of fields. */
export function FormSkeleton({ label = "Loading…", header = true }: { label?: string; header?: boolean }) {
  return (
    <Busy label={label}>
      {header ? <HeaderSkeleton actions={0} /> : null}
      <CardSkeleton className="max-w-3xl space-y-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-3.5 w-24" /><Skeleton className="h-9 w-full" /></div>)}
      </CardSkeleton>
    </Busy>
  );
}
