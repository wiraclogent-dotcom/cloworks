import { timelineLayout, type TimelineProject } from "@/lib/timeline";
import { formatJakartaDate } from "@/lib/projects";

const LABEL_REM = 12;

type Item = TimelineProject & { title: string; startDate: Date | null; dueDate: Date | null };

/**
 * Week-based timeline in plain HTML/CSS. The projects table is the accessible equivalent: every bar carries a text
 * label and title, and the visual chart itself is a list.
 */
export function ProjectTimeline({ projects, today }: { projects: Item[]; today: Date }) {
  const layout = timelineLayout(projects, today);
  if (layout.bars.length === 0)
    return <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">The timeline shows projects that have both a start and a due date. None yet.</p>;
  const byId = new Map(projects.map((p) => [p.id, p]));
  const cols = layout.weeks.length;
  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">
        Weeks start on Monday. The same details are in the tables above.
        {layout.truncated && " Showing the first 26 weeks only; later parts of longer projects are cut off."}
        {layout.omitted.length > 0 && ` Not drawn because they start after this range: ${layout.omitted.map((id) => byId.get(id)?.title ?? id).join(", ")}.`}
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <div style={{ minWidth: `${Math.max(40, cols * 4.5 + LABEL_REM)}rem`, "--label-w": `${LABEL_REM}rem` } as React.CSSProperties} className="relative">
          <div className="flex border-b border-border bg-muted text-xs font-semibold">
            <div className="w-(--label-w) shrink-0 px-3 py-2">Project</div>
            <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {layout.weeks.map((w) => <div key={w.startDay} className="border-l border-border px-1 py-2 whitespace-nowrap">{w.label}</div>)}
            </div>
          </div>
          <ol aria-label="Project timeline">
            {layout.bars.map((b) => {
              const p = byId.get(b.id)!;
              const range = `${formatJakartaDate(p.startDate!)} to ${formatJakartaDate(p.dueDate!)}${b.clipped ? " (continues past the range shown)" : ""}`;
              return (
                <li key={b.id} className="flex items-center border-t border-border text-sm first:border-t-0">
                  <div className="w-(--label-w) shrink-0 truncate px-3 py-2" title={p.title}>
                    {p.title}
                    <span className="sr-only">, {range}</span>
                  </div>
                  <div className="relative h-8 flex-1">
                    <div
                      title={`${p.title}: ${range}`}
                      className="absolute top-1.5 h-5 rounded bg-primary"
                      style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
                    >
                      {b.clipped && <span aria-hidden="true" className="absolute right-0.5 text-xs leading-5 text-primary-foreground">▶</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          {layout.todayPct !== null && (
            <div aria-hidden="true" className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-foreground" style={{ left: `calc(var(--label-w) + (100% - var(--label-w)) * ${layout.todayPct / 100})` }}>
              <span className="absolute -top-0 left-1 rounded bg-foreground px-1 text-[10px] text-background">Today</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
