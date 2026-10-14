import Link from "next/link";
import type { Tone } from "@/lib/palette";
import { daysLeft } from "@/lib/daysLeft";
import { itemSlug } from "@/lib/projectItemList";
import type { ItemFacts } from "@/lib/kpi/projectItems";
import type { TargetItem } from "@/lib/kpi/projectQueries";
import { Badge } from "@/components/shadcn/badge";
import { DeadlineChip } from "@/components/ui/DeadlineChip";
import { Card } from "@/components/shadcn/card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/components/ui/cn";
import { RemoveTargetButton } from "./RemoveTargetButton";

export type TargetBadge = { text: string; tone: Tone; muted: boolean };

/** The one status word on a row. Judged items say On time / Late; the rest say why they are not (yet) judged. */
export function targetBadge(f: Pick<ItemFacts, "state" | "onTime">): TargetBadge {
  if (f.state === "cancelled") return { text: "Cancelled", tone: "tag-neutral", muted: true };
  if (f.state === "removed") return { text: "Item removed", tone: "tag-neutral", muted: true };
  if (f.state === "finishedUntracked") return { text: "Finished before tracking", tone: "tag-neutral", muted: false };
  if (f.onTime === true) return { text: "On time", tone: "done", muted: false };
  if (f.onTime === false) return { text: "Late", tone: "overdue", muted: false };
  return { text: "In progress", tone: "tag-neutral", muted: false };
}

const dateText = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(d);

/**
 * One item: Project › Item (link), progress, due date, badge and the slip / revision counts. `canManage` adds the ×
 * (only on real targets). `muted` is for the "Not scored" group and for other work.
 */
export function TargetRow({ item, canManage, muted = false }: { item: ItemFacts & { targetId?: string }; canManage: boolean; muted?: boolean }) {
  const badge = targetBadge(item);
  const label = `${item.projectTitle} › ${item.itemTitle}`;
  return (
    <li data-state={item.state} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3", muted && "text-muted-foreground")}>
      <div className="min-w-0 grow basis-60">
        {/* The link uses the base slug of the title alone. If two different titles slug to the same value (e.g. "A-B" and "A B"), the page gives the second one a "-2" suffix, so this link opens the first matching item. */}
        <Link href={`/projects/${item.projectId}#item-${itemSlug(item.itemTitle, new Set())}`} className="text-sm font-medium break-words text-foreground hover:underline underline-offset-2">
          <span className="text-muted-foreground">{item.projectTitle}</span> › {item.itemTitle}
        </Link>
        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">{item.slips} {item.slips === 1 ? "slip" : "slips"} · {item.revisions} {item.revisions === 1 ? "revision" : "revisions"}</p>
      </div>
      <div className="w-32 shrink-0">
        <ProgressBar hideLabel label={`${label} progress`} value={Math.round(item.progress * 100)} />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {item.state === "open" ? (
          <DeadlineChip daysLeft={daysLeft(item.dueDate)} />
        ) : item.dueDate ? (
          <span className="text-xs text-muted-foreground tabular-nums">Due {dateText(item.dueDate)}</span>
        ) : null}
        <Badge tone={badge.tone} className={cn(badge.muted && "bg-transparent text-foreground-muted outline outline-1 -outline-offset-1 outline-border")}>{badge.text}</Badge>
        {canManage && item.targetId ? <RemoveTargetButton targetId={item.targetId} label={label} /> : null}
      </div>
    </li>
  );
}

/** A bordered list of rows (`bare`: no frame, for use inside another card). */
export function TargetList({ items, canManage, muted = false, bare = false }: { items: (ItemFacts & { targetId?: string })[]; canManage: boolean; muted?: boolean; bare?: boolean }) {
  const rows = items.map((it, i) => <TargetRow key={`${(it as TargetItem).targetId ?? "other"}-${i}`} item={it} canManage={canManage} muted={muted} />);
  if (bare) return <ul className="divide-y divide-border overflow-hidden">{rows}</ul>;
  return <Card asChild className="divide-y divide-border overflow-hidden p-0"><ul>{rows}</ul></Card>;
}
