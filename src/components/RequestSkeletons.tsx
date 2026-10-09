import { Skeleton } from "./ui/Skeleton";
import { cn } from "./ui/cn";

/** Screen-reader status for a loading region; the skeleton blocks themselves are aria-hidden. */
export function Busy({ label, wide, className, children }: { label: string; wide?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" data-page-wide={wide ? "" : undefined} className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Title row + filter pills, shared by the board and table fallbacks. */
function HeaderSkeleton() {
  return (
    <>
      <div className="mb-5 flex items-center gap-4">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="ml-auto h-9 w-40" rounded="xl" />
        <Skeleton className="h-9 w-32" rounded="xl" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2.5">
        {["w-52", "w-36", "w-36", "w-36", "w-36", "w-28"].map((w, i) => <Skeleton key={i} className={cn("h-8", w)} rounded="full" />)}
      </div>
    </>
  );
}

/** Requests board fallback: 4 columns with 3 card placeholders each. */
export function BoardSkeleton() {
  return (
    <Busy label="Loading requests…" wide className="w-full">
      <HeaderSkeleton />
      <div className="grid gap-3 overflow-hidden pb-4" style={{ gridTemplateColumns: "repeat(4, minmax(15rem, 1fr))" }} data-skeleton-board="">
        {[0, 1, 2, 3].map((c) => (
          <div key={c} data-skeleton-column="" className="flex flex-col gap-2 rounded-xl border border-border bg-surface-muted p-2">
            <Skeleton className="h-9 w-full" rounded="xl" />
            {[0, 1, 2].map((k) => (
              <div key={k} data-skeleton-card="" className="space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-card">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
                <div className="flex gap-1.5"><Skeleton className="h-5 w-16" /><Skeleton className="h-5 w-20" /></div>
                <div className="flex items-center justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="size-7" rounded="full" /></div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Busy>
  );
}

/** Requests table fallback: header row + 8 row placeholders inside the table card. */
export function TableSkeleton() {
  return (
    <Busy label="Loading requests…">
      <HeaderSkeleton />
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
        <div className="flex h-10 items-center gap-6 border-b border-border bg-surface-muted px-3">
          {[24, 16, 16, 14, 16].map((w, i) => <Skeleton key={i} className={cn("h-3", WIDTH[w])} />)}
        </div>
        {Array.from({ length: 8 }, (_, r) => (
          <div key={r} data-skeleton-row="" className="flex h-11 items-center gap-6 border-t border-border px-3 first:border-t-0">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="size-5" rounded="full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </Busy>
  );
}

/** Requests calendar fallback: month bar, weekday row and a 5-week grid with a few card placeholders. */
export function CalendarSkeleton() {
  return (
    <Busy label="Loading calendar…" wide className="w-full">
      <HeaderSkeleton />
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="ml-auto h-8 w-32" rounded="xl" />
      </div>
      <div className="grid grid-cols-7 gap-1" data-skeleton-calendar="">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} data-skeleton-day="" className="min-h-28 space-y-1.5 rounded-lg border border-border bg-surface p-1.5">
            <Skeleton className="size-5" rounded="full" />
            {i % 3 === 1 && <Skeleton className="h-9 w-full" />}
            {i % 5 === 2 && <Skeleton className="h-9 w-full" />}
          </div>
        ))}
      </div>
    </Busy>
  );
}

/** Requests timeline fallback: range bar, then a label column + 14 day columns with a few bar placeholders per person. */
export function TimelineSkeleton() {
  return (
    <Busy label="Loading timeline…" wide className="w-full">
      <HeaderSkeleton />
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="ml-auto h-8 w-32" rounded="xl" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card" data-skeleton-timeline="">
        <div className="h-9 border-b border-border bg-surface-muted" />
        {[0, 1, 2, 3, 4].map((r) => (
          <div key={r} data-skeleton-person="" className="grid grid-cols-[12rem_minmax(0,1fr)] border-t border-border first:border-t-0">
            <div className="flex items-center gap-2 border-r border-border px-3 py-3">
              <Skeleton className="size-6" rounded="full" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="grid grid-cols-14 gap-y-1 py-2">
              <Skeleton className={cn("col-span-5 h-6", OFFSET[r % 3])} />
              {r % 2 === 0 && <Skeleton className={cn("col-span-4 h-6", OFFSET[(r + 1) % 3])} />}
            </div>
          </div>
        ))}
      </div>
    </Busy>
  );
}

const OFFSET = ["col-start-1", "col-start-4", "col-start-8"];

const WIDTH: Record<number, string> ={ 14: "w-14", 16: "w-16", 24: "w-24" };

/** Request detail fallback: header, then a wide column of cards and a narrow details column. */
export function DetailSkeleton() {
  return (
    <Busy label="Loading request…">
      <Skeleton className="mb-3 h-4 w-24" />
      <Skeleton className="mb-3 h-7 w-2/3" />
      <div className="mb-6 flex gap-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-5 w-28" /></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" data-skeleton-detail="">
        <div className="space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card">
          <Skeleton className="h-5 w-24" />
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex justify-between gap-4"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-28" /></div>)}
        </div>
      </div>
    </Busy>
  );
}
