"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { Badge } from "@/components/shadcn/badge";
import { StatusIcon } from "@/components/ui/StatusIcon";
import { cn } from "@/components/ui/cn";
import { TableCell, TableRow } from "@/components/shadcn/table";
import { PROJECT_STATUS_TONE } from "@/lib/palette";
import { PROJECT_STAGE_LABEL, TASK_STATUS_LABEL, formatJakartaDay } from "@/lib/projectTasks";
import type { ProjectStage, ProjectStatus } from "@prisma/client";
import { StageSelect } from "./StageSelect";
import { StatusSelect } from "./StatusSelect";
import { FileLinkEdit } from "./FileLinkEdit";
import { FileLocationLink } from "@/components/ui/FileLocationLink";
import { DateEdit } from "./DateEdit";
import { EditableName, OwnerSelect } from "./DetailEdit";
import { RowActions } from "./RowActions";
import type { TaskMode } from "@/lib/projectProgress";
import { Button } from "@/components/shadcn/button";

// Cells keep one line (the inline editors sit beside their buttons); the table container scrolls sideways when needed.
const cell = (className?: string) => cn("whitespace-nowrap", className);

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
export function TaskRow({ projectId, canManage, task, owners, mode, isFirst, isLast, hideItem = false }: {
  projectId: string; canManage: boolean; task: TaskRowData; owners: { id: string; name: string }[]; mode: TaskMode;
  isFirst: boolean; isLast: boolean;
  /** Leaves out the Item cell (the row sits under its item): the pencil, move and delete controls move to the Detail cell
   *  and the item name is not editable here. */
  hideItem?: boolean;
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

  const pencil = canManage && (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-7 [&_svg]:size-3.5"
      aria-label={editing ? `Done editing ${label}` : `Edit ${label}`}
      aria-pressed={editing}
      title={editing ? "Done editing" : "Edit this row"}
      onClick={() => { setNameError(null); setEditing((e) => !e); }}
    >
      {editing ? <Check aria-hidden="true" /> : <Pencil aria-hidden="true" />}
    </Button>
  );
  const actions = <RowActions projectId={projectId} taskId={task.id} label={label} isFirst={isFirst} isLast={isLast} />;

  return (
    <TableRow className={cn(canceled && "text-foreground-muted line-through opacity-60")} data-editing={editing || undefined}>
      {!hideItem && (
        <TableCell className={cell("font-medium")}>
          <div className="flex items-center gap-2">
            {pencil}
            {editing ? (
              <EditableName projectId={projectId} taskId={task.id} field="title" value={task.title} label={label} onFail={nameFailed} />
            ) : (
              <span>{task.title}</span>
            )}
          </div>
          {nameError && <p role="alert" className="mt-1 pl-9 text-xs text-danger">{nameError}</p>}
          {editing && <div className="mt-1.5 pl-9">{actions}</div>}
        </TableCell>
      )}
      <TableCell className={cell(hideItem ? "font-medium" : undefined)}>
        {hideItem ? (
          <>
            <div className="flex items-center gap-2">
              {pencil}
              {editing ? (
                <EditableName projectId={projectId} taskId={task.id} field="subTitle" value={task.subTitle ?? ""} label={label} onFail={nameFailed} />
              ) : (
                <span>{task.subTitle ?? "—"}</span>
              )}
            </div>
            {nameError && <p role="alert" className="mt-1 pl-9 text-xs text-danger">{nameError}</p>}
            {editing && <div className="mt-1.5 pl-9">{actions}</div>}
          </>
        ) : editing ? (
          <EditableName projectId={projectId} taskId={task.id} field="subTitle" value={task.subTitle ?? ""} label={label} onFail={nameFailed} />
        ) : task.subTitle ?? "—"}
      </TableCell>
      <TableCell className={cell()}>
        {editing ? (
          <OwnerSelect projectId={projectId} taskId={task.id} value={task.ownerId} owners={owners} label={label} />
        ) : task.ownerName ?? "—"}
      </TableCell>
      <TableCell className={cell()}>
        {mode === "status" ? (
          editing ? (
            <StatusSelect projectId={projectId} taskId={task.id} value={task.status} label={label} />
          ) : task.status ? (
            <Badge tone={PROJECT_STATUS_TONE[task.status]}><StatusIcon status={task.status} />{TASK_STATUS_LABEL[task.status]}</Badge>
          ) : "—"
        ) : editing ? (
          <StageSelect projectId={projectId} taskId={task.id} value={task.stage} label={label} />
        ) : task.stage ? (
          <Badge>{PROJECT_STAGE_LABEL[task.stage]}</Badge>
        ) : "—"}
      </TableCell>
      <TableCell className={cell("tabular-nums")}>
        {editing ? (
          <DateEdit projectId={projectId} taskId={task.id} field="start" iso={task.startIso} text={startText} label={label} />
        ) : startText}
      </TableCell>
      <TableCell className={cell("tabular-nums")}>
        {editing ? (
          <DateEdit projectId={projectId} taskId={task.id} field="due" iso={task.dueIso} text={dueText} label={label} />
        ) : dueText}
      </TableCell>
      <TableCell className={cell("text-muted-foreground")}>
        {editing ? (
          <FileLinkEdit projectId={projectId} taskId={task.id} fileUrl={task.fileUrl} text={fileText} label={label} />
        ) : task.fileUrl ? (
          <FileLocationLink href={task.fileUrl} name={fileText} className="text-link underline-offset-2 hover:underline">{fileText}</FileLocationLink>
        ) : fileText}
      </TableCell>
    </TableRow>
  );
}
