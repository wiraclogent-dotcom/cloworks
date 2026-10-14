import type { ProjectStage, ProjectStatus } from "@prisma/client";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import type { ItemRowInput, ProjectItem } from "@/lib/projectItemList";
import { PROJECT_STATUS_TONE, type Tone } from "@/lib/palette";
import { PROJECT_STAGES, finalShare, stageCounts, statusCounts, taskMode } from "@/lib/projectProgress";
import { PROJECT_STAGE_LABEL, TASK_STATUS_LABEL, TASK_STATUS_ORDER } from "@/lib/projectTasks";

/** Tone of each stage in the progress bar and legend. Every stage gets its own palette entry; Final Artwork is the "done"
 *  tone and Canceled the "cancelled" one. Statuses (tracker projects) use PROJECT_STATUS_TONE; "none" is neutral. */
export const PROJECT_STAGE_TONE: Record<ProjectStage, Tone> = {
  NOT_STARTED: "requested",
  FIRST_PREVIEW: "first-look",
  MANUSCRIPT: "tag-clogent",
  TECHNICAL_ARTWORK: "needs-motion",
  APPROVAL: "due-soon",
  FINAL_ARTWORK: "done",
  CANCELLED: "cancelled",
};

type Segment = { key: string; label: string; tone: Tone; n: number };

function segmentsFor(rows: ItemRowInput[], mode: "stage" | "status"): Segment[] {
  if (mode === "status") {
    const counts = statusCounts(rows);
    return [
      ...TASK_STATUS_ORDER.map((s: ProjectStatus) => ({ key: s, label: TASK_STATUS_LABEL[s], tone: PROJECT_STATUS_TONE[s], n: counts[s] })),
      { key: "none", label: "No status yet", tone: "tag-neutral" as Tone, n: counts.none },
    ].filter((s) => s.n > 0);
  }
  const counts = stageCounts(rows.filter((r) => r.stage !== "CANCELLED"));
  return [
    ...PROJECT_STAGES.filter((s) => s !== "CANCELLED").map((s) => ({ key: s, label: PROJECT_STAGE_LABEL[s], tone: PROJECT_STAGE_TONE[s], n: counts[s] })),
    { key: "none", label: "No stage yet", tone: "tag-neutral" as Tone, n: counts.none },
  ].filter((s) => s.n > 0);
}

/** Overall progress of a project: percent done, items done, and one stacked bar of live rows per stage (or status). */
export function ProjectProgressSummary({ rows, items }: { rows: ItemRowInput[]; items: ProjectItem[] }) {
  const mode = taskMode(rows);
  const { percent } = finalShare(rows, mode);
  const counted = items.filter((i) => !i.allCancelled);
  const doneItems = counted.filter((i) => i.done).length;
  const segments = segmentsFor(rows, mode);
  const total = segments.reduce((sum, s) => sum + s.n, 0);

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-2xl font-semibold text-foreground tabular-nums">{`${percent}% done`}</p>
        <p className="text-sm text-foreground-secondary tabular-nums">{`${doneItems} of ${counted.length} items done`}</p>
      </div>
      <div aria-hidden="true" className="mt-3 flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-surface-muted">
        {segments.map((s) => (
          <div key={s.key} data-segment={s.key} data-tone={s.tone} className="h-full bg-tone-accent" style={{ width: `${(s.n / total) * 100}%` }} />
        ))}
      </div>
      <ul aria-label="Progress breakdown" className="sr-only">
        {segments.map((s) => <li key={s.key}>{`${s.label}: ${s.n}`}</li>)}
      </ul>
      <div aria-hidden="true" className="mt-3 flex flex-wrap gap-1.5">
        {segments.map((s) => <Chip key={s.key} tone={s.tone}>{`${s.label} ${s.n}`}</Chip>)}
      </div>
    </Card>
  );
}
