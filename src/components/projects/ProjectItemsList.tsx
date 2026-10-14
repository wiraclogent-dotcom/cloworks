import { Boxes } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ProjectItem } from "@/lib/projectItemList";
import type { TaskMode } from "@/lib/projectProgress";
import { AddDetailForm } from "@/app/(app)/projects/[id]/tasks/AddDetailForm";
import type { TaskRowData } from "@/app/(app)/projects/[id]/tasks/TaskRow";
import { ProjectItemRow } from "./ProjectItemRow";

/** The project page's working list: one expandable row per item, then "Add item" for managers. `rowsData` maps a row id to
 *  the editor data of that row. */
export function ProjectItemsList({ projectId, items, rowsData, mode, owners, canManage }: {
  projectId: string; items: ProjectItem[]; rowsData: Map<string, TaskRowData>; mode: TaskMode;
  owners: { id: string; name: string }[]; canManage: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="grid gap-4">
        <EmptyState icon={<Boxes />} title="No items yet" description="Items and their variants show up here once they are added." />
        {canManage && <AddDetailForm projectId={projectId} mode={mode} owners={owners} label="Add item" />}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {items.map((item) => (
        <ProjectItemRow
          key={item.slug}
          projectId={projectId}
          item={item}
          rows={item.rows.map((r) => rowsData.get(r.id)).filter((r): r is TaskRowData => !!r)}
          mode={mode}
          owners={owners}
          canManage={canManage}
        />
      ))}
      {canManage && <AddDetailForm projectId={projectId} mode={mode} owners={owners} label="Add item" />}
    </div>
  );
}
