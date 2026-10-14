import { AvatarStack } from "@/components/ui/Avatar";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ItemLink } from "./ItemLink";
import { DeadlineChip } from "@/components/ui/DeadlineChip";
import { daysLeft } from "@/lib/daysLeft";
import { needsAttention, type ProjectItem } from "@/lib/projectItemList";
import type { TaskMode } from "@/lib/projectProgress";
import { PROJECT_STAGE_LABEL, TASK_STATUS_LABEL } from "@/lib/projectTasks";

function countLabel(key: ProjectItem["counts"][number]["key"], mode: TaskMode): string {
  if (key === "none") return mode === "status" ? "No status yet" : "No stage yet";
  return mode === "status" ? TASK_STATUS_LABEL[key as keyof typeof TASK_STATUS_LABEL] : PROJECT_STAGE_LABEL[key as keyof typeof PROJECT_STAGE_LABEL];
}

/** Items that are overdue or due within a week, overdue first. Renders nothing when there are none. `mode` only picks the
 *  wording of the stage/status summary (default: stages). */
export function NeedsAttention({ items, now, mode = "stage" }: { items: ProjectItem[]; now: Date; mode?: TaskMode }) {
  const list = needsAttention(items, now);
  if (list.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle>{`Needs attention (${list.length})`}</CardTitle></CardHeader>
      <ul className="divide-y divide-border">
        {list.map(({ item }) => (
          <li key={item.slug} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
            <ItemLink slug={item.slug} className="min-w-0 flex-1 basis-40 truncate text-sm font-medium text-foreground hover:underline focus-visible:underline" title={item.title}>{item.title}</ItemLink>
            {item.owners.length > 0 && <AvatarStack names={item.owners} max={3} size="sm" label="Owners" />}
            <DeadlineChip daysLeft={daysLeft(item.dueDate, now)} />
            <span className="basis-full text-xs text-foreground-secondary">
              {item.counts.map((c) => `${countLabel(c.key, mode)} ${c.n}`).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
