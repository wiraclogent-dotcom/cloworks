"use client";

import { useState, useTransition } from "react";
import type { ProjectStatus } from "@prisma/client";
import { TASK_STATUS_ORDER } from "@/lib/projectTasks";
import { TASK_STATUS_LABEL } from "@/lib/projectTasks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { setTaskStatus } from "./actions";

/** Status picker for one tracker task. Saves on change; on failure it reverts and shows the reason. */
export function StatusSelect({ projectId, taskId, value, label }: { projectId: string; taskId: string; value: ProjectStatus | null; label: string }) {
  const [stage, setStage] = useState<ProjectStatus | null>(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    const prev = stage;
    const nextStatus = next as ProjectStatus;
    setStage(nextStatus);
    setError(null);
    startTransition(async () => {
      const r = await setTaskStatus(projectId, taskId, nextStatus);
      if (!r.ok) {
        setStage(prev);
        setError(r.message);
      }
    });
  }

  return (
    <div className="grid gap-1">
      <Select value={stage ?? undefined} onValueChange={change} disabled={pending}>
        <SelectTrigger size="sm" className="w-44" aria-label={`Status for ${label}`}>
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          {TASK_STATUS_ORDER.map((st) => (
            <SelectItem key={st} value={st}>{TASK_STATUS_LABEL[st]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
