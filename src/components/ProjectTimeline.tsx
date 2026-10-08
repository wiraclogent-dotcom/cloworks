import { ChevronRight } from "lucide-react";
import type { ProjectStatus } from "@prisma/client";
import { timelineLayout, type TimelineProject } from "@/lib/timeline";
import { PROJECT_STATUS_LABEL, formatJakartaDate } from "@/lib/projects";
import { PROJECT_STATUS_TONE } from "@/lib/palette";
import { StatusChip } from "./ui/StatusChip";

const STATUS_ORDER: ProjectStatus[] = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "ON_HOLD", "DONE"];

const LABEL_REM = 13;

type Item = TimelineProject & { title: string; startDate: Date | null; dueDate: Date | null; status?: ProjectStatus };

/**
 * Week-based timeline in plain HTML/CSS (rendered inside the page's Timeline card). The projects table is the
 * accessible equivalent: every bar carries a text label (title, dates, status) and a title tooltip, and the chart
 * itself is a list. Bars are filled with the status tone's text colour (solid, ≥ 3:1 on the card in both themes).
 */
export function ProjectTimeline({ projects, today }: { projects: Item[]; today: Date }) {
  const layout = timelineLayout(projects, today);
  if (layout.bars.length === 0)
    return <p className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-foreground-secondary">The timeline shows projects that have both a start and a due date. None yet.</p>;
  const byId = new Map(projects.map((p) => [p.id, p]));
  const cols = layout.weeks.length;
  const drawn = new Set(layout.bars.map((b) => byId.get(b.id)?.status).filter(Boolean));
  const legend = STATUS_ORDER.filter((st) => drawn.has(st));
  return (
    <div>
      <p className="mb-3 text-[13px] text-foreground-secondary">
        Weeks start on Monday. The same details are in the tables above.
        {layout.truncated && " Showing the first 26 weeks only; later parts of longer projects are cut off."}
        {layout.omitted.length > 0 && ` Not drawn because they start after this range: ${layout.omitted.map((id) => byId.get(id)?.title ?? id).join(", ")}.`}
      </p>
      <div className="relative overflow-x-auto rounded-lg border border-border">
        <div style={{ minWidth: `${Math.max(40, cols * 4.5 + LABEL_REM)}rem`, "--label-w": `${LABEL_REM}rem` } as React.CSSProperties} className="relative">
          <div className="flex border-b border-border bg-surface-muted text-xs font-semibold text-foreground-secondary">
            <div className="w-(--label-w) shrink-0 px-3 py-2">Project</div>
            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {layout.weeks.map((w) => <div key={w.startDay} className="border-l border-border px-1.5 py-2 whitespace-nowrap tabular-nums">{w.label}</div>)}
            </div>
          </div>
          <ol aria-label="Project timeline">
            {layout.bars.map((b) => {
              const p = byId.get(b.id)!;
              const status = p.status ? ` · ${PROJECT_STATUS_LABEL[p.status]}` : "";
              const range = `${formatJakartaDate(p.startDate!)} to ${formatJakartaDate(p.dueDate!)}${b.clipped ? " (continues past the range shown)" : ""}`;
              return (
                <li key={b.id} className="flex items-center border-t border-border text-[13px] first:border-t-0">
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
                      {b.clipped && <ChevronRight aria-hidden="true" strokeWidth={2} className="absolute top-0.5 right-0.5 size-4 text-tone-tint" />}
                    </div>
                  </div>
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
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
          <span>Bar colour = status:</span>
          <ul className="flex flex-wrap gap-1.5">{legend.map((st) => <li key={st}><StatusChip status={st} /></li>)}</ul>
        </div>
      )}
    </div>
  );
}
