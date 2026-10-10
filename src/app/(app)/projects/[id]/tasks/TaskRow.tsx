"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Badge } from "@/components/shadcn/badge";
import { TableCell, TableRow } from "@/components/shadcn/table";
import { PROJECT_STAGE_LABEL, TASK_STATUS_LABEL, formatJakartaDay } from "@/lib/projectTasks";
import type { ProjectStage, ProjectStatus } from "@prisma/client";
import { StageSelect } from "./StageSelect";
import { StatusSelect } from "./StatusSelect";
import { FileLinkEdit } from "./FileLinkEdit";
import { DateEdit } from "./DateEdit";
import { EditableName, OwnerSelect } from "./DetailEdit";
import { RowActions } from "./RowActions";
import type { TaskMode } from "@/lib/projectProgress";

export type TaskRowData = {
  id: string;
  title: string;
  subTitle: string | null;
  ownerId: string | null;
  ownerName: string | null;
  stage: ProjectStage | null;
  status: ProjectStatus | null;
  startIso: string | null;
  dueIso: string | null;
  dueTbc: boolean;
  fileName: string | null;
  fileUrl: string | null;
  notes: string | null;
};

/**
 * One row. Read-only by default; the pencil in the Item cell turns on editing for this row only (names, owner,
 * stage or status, dates and file link become editable, and the row can be moved or deleted). Only managers see
 * the pencil. `mode` says what the fourth column holds for this project: design stages, or tracker statuses.
 */
export function TaskRow({ projectId, canManage, task, owners, mode, isFirst, isLast }: {
  projectId: string; canManage: boolean; task: TaskRowData; owners: { id: string; name: string }[]; mode: TaskMode;
  isFirst: boolean; isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  // A refused name save can land after Done closed editing: reopen the row so the message has somewhere to show.
  const nameFailed = (message: string) => { setEditing(true); setNameError(message); };
  const label = `${task.title} ${task.subTitle ?? ""}`.trim();
  const canceled = task.stage === "CANCELLED";
  const startText = task.startIso ? formatJakartaDay(task.startIso) : "—";
  const dueText = task.dueTbc ? "TBC" : task.dueIso ? formatJakartaDay(task.dueIso) : "—";
  const fileText = task.fileName ?? task.notes?.replace(/^Sheet file column: /, "") ?? (task.fileUrl ? "Open file" : "No file");

  return (
    <TableRow className={canceled ? "text-foreground-muted line-through opacity-60" : undefined} data-editing={editing || undefined}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {canManage && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              aria-label={editing ? `Done editing ${label}` : `Edit ${label}`}
              aria-pressed={editing}
              title={editing ? "Done editing" : "Edit this row"}
              onClick={() => { setNameError(null); setEditing((e) => !e); }}
            >
              {editing ? <Check aria-hidden="true" className="size-3.5" /> : <Pencil aria-hidden="true" className="size-3.5" />}
            </Button>
          )}
          {editing ? (
            <EditableName projectId={projectId} taskId={task.id} field="title" value={task.title} label={label} onFail={nameFailed} />
          ) : (
            <span>{task.title}</span>
          )}
        </div>
        {nameError && <p role="alert" className="mt-1 pl-9 text-xs text-danger">{nameError}</p>}
        {editing && (
          <div className="mt-1.5 pl-9">
            <RowActions projectId={projectId} taskId={task.id} label={label} isFirst={isFirst} isLast={isLast} />
          </div>
        )}
      </TableCell>
      <TableCell>
        {editing ? (
          <EditableName projectId={projectId} taskId={task.id} field="subTitle" value={task.subTitle ?? ""} label={label} onFail={nameFailed} />
        ) : task.subTitle ?? "—"}
      </TableCell>
      <TableCell>
        {editing ? (
          <OwnerSelect projectId={projectId} taskId={task.id} value={task.ownerId} owners={owners} label={label} />
        ) : task.ownerName ?? "—"}
      </TableCell>
      <TableCell>
        {mode === "status" ? (
          editing ? (
            <StatusSelect projectId={projectId} taskId={task.id} value={task.status} label={label} />
          ) : task.status ? (
            <Badge variant="secondary">{TASK_STATUS_LABEL[task.status]}</Badge>
          ) : "—"
        ) : editing ? (
          <StageSelect projectId={projectId} taskId={task.id} value={task.stage} label={label} />
        ) : task.stage ? (
          <Badge variant="secondary">{PROJECT_STAGE_LABEL[task.stage]}</Badge>
        ) : "—"}
      </TableCell>
      <TableCell className="tabular-nums">
        {editing ? (
          <DateEdit projectId={projectId} taskId={task.id} field="start" iso={task.startIso} text={startText} label={label} />
        ) : startText}
      </TableCell>
      <TableCell className="tabular-nums">
        {editing ? (
          <DateEdit projectId={projectId} taskId={task.id} field="due" iso={task.dueIso} text={dueText} label={label} />
        ) : dueText}
      </TableCell>
      <TableCell className="text-foreground-secondary">
        {editing ? (
          <FileLinkEdit projectId={projectId} taskId={task.id} fileUrl={task.fileUrl} text={fileText} label={label} />
        ) : task.fileUrl ? (
          <a href={task.fileUrl} target="_blank" rel="noopener noreferrer" className="text-link underline-offset-2 hover:underline">{fileText}</a>
        ) : fileText}
      </TableCell>
    </TableRow>
  );
}
