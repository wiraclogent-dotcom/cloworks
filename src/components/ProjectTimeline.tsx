import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { timelineLayout, type TimelineProject } from "@/lib/timeline";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, formatJakartaDate } from "@/lib/projects";
import { PROJECT_STATUS_TONE } from "@/lib/palette";
import { StatusChip } from "./ui/StatusChip";
import { cn } from "./ui/cn";

const LABEL_REM = 13;

type Item = TimelineProject & { title: string; startDate: Date | null; dueDate: Date | null; status?: ProjectStatus };

/** One row's content: the title cell and the bar track. Wrapped in a link when the timeline is linkable. */
const ROW = "flex w-full items-center";

/**
 * Week-based timeline in plain HTML/CSS (rendered inside the page's Timeline card). The projects table is the
 * accessible equivalent: every bar carries a text label (title, dates, status) and a title tooltip, and the chart
 * itself is a list. Bars are filled with the status tone's text colour (solid, ≥ 3:1 on the card in both themes).
 */
export function ProjectTimeline({ projects, today, href }: {
  projects: Item[]; today: Date;
  /** Makes each row (title and bar together) one link to this URL. Without it rows are plain (e.g. the detail page's per-item timeline). */
  href?: (item: Item) => string;
}) {
  const layout = timelineLayout(projects, today);
  if (layout.bars.length === 0)
    return <p className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-muted-foreground">The timeline shows projects that have both a start and a due date. None yet.</p>;
  const byId = new Map(projects.map((p) => [p.id, p]));
  const cols = layout.weeks.length;
  const drawn = new Set(layout.bars.map((b) => byId.get(b.id)?.status).filter(Boolean));
  const legend = PROJECT_STATUSES.filter((st) => drawn.has(st));
  return (
    <div>
      <p className="mb-3 text-[13px] text-muted-foreground">
        Weeks start on Monday. Each bar is labelled with its dates and status.
        {layout.truncated && " Showing the first 26 weeks only; later parts of longer projects are cut off."}
        {layout.omitted.length > 0 && ` Not drawn because they start after this range: ${layout.omitted.map((id) => byId.get(id)?.title ?? id).join(", ")}.`}
        {layout.dueBefore.length > 0 && ` Due before this range, not drawn: ${layout.dueBefore.map((id) => byId.get(id)?.title ?? id).join(", ")}.`}
      </p>
      <div className="relative overflow-x-auto rounded-lg border border-border">
        <div style={{ minWidth: `${Math.max(40, cols * 4.5 + LABEL_REM)}rem`, "--label-w": `${LABEL_REM}rem` } as React.CSSProperties} className="relative">
          <div className="flex border-b border-border bg-muted text-xs font-semibold text-muted-foreground">
            <div className="w-(--label-w) shrink-0 px-3 py-2">Project</div>
            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {layout.weeks.map((w) => <div key={w.startDay} className="border-l border-border px-1.5 py-2 whitespace-nowrap tabular-nums">{w.label}</div>)}
            </div>
          </div>
          <ol aria-label="Project timeline">
            {layout.bars.map((b) => {
              const p = byId.get(b.id)!;
              const status = p.status ? ` · ${PROJECT_STATUS_LABEL[p.status]}` : "";
              const dates = `${formatJakartaDate(p.startDate!)} to ${formatJakartaDate(p.dueDate!)}`;
              const clips = `${b.clippedStart ? " (started before the range shown)" : ""}${b.clipped ? " (continues past the range shown)" : ""}`;
              const range = `${dates}${clips}`;
              const content = (
                <>
                  <div className="w-(--label-w) shrink-0 truncate px-3 py-2 font-medium" title={p.title}>
                    {p.title}
                    <span className="sr-only">, {range}{status}</span>
                  </div>
                  <div className="relative h-9 flex-1">
                    <div
                      title={`${p.title}: ${range}${status}`}
                      data-tone={p.status ? PROJECT_STATUS_TONE[p.status] : "in-progress"}
                      className="absolute top-2 h-5 rounded-md bg-tone-text shadow-card"
                      style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
                    >
                      {b.clippedStart && <ChevronLeft aria-hidden="true" strokeWidth={2} className="absolute top-0.5 left-0.5 size-4 text-tone-tint" />}
                      {b.clipped && <ChevronRight aria-hidden="true" strokeWidth={2} className="absolute top-0.5 right-0.5 size-4 text-tone-tint" />}
                    </div>
                  </div>
                </>
              );
              const url = href?.(p);
              return (
                <li key={b.id} className="border-t border-border text-[13px] first:border-t-0">
                  {url ? (
                    <Link href={url} aria-label={`${p.title}, ${range}${p.status ? `, ${PROJECT_STATUS_LABEL[p.status]}` : ""}`}
                      className={cn(ROW, "hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring")}>
                      {content}
                    </Link>
                  ) : <div className={ROW}>{content}</div>}
                </li>
              );
            })}
          </ol>
          {layout.todayPct !== null && (
            <div aria-hidden="true" data-today="" className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-danger" style={{ left: `calc(var(--label-w) + (100% - var(--label-w)) * ${layout.todayPct / 100})` }}>
              <span className="absolute top-1 left-1 rounded bg-destructive px-1 text-[10px] leading-4 font-semibold text-destructive-foreground">Today</span>
            </div>
          )}
        </div>
      </div>
      {legend.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Bar colour = status:</span>
          <ul className="flex flex-wrap gap-1.5">{legend.map((st) => <li key={st}><StatusChip status={st} kind="project" /></li>)}</ul>
        </div>
      )}
    </div>
  );
}
