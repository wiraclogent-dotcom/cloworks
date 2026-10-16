"use client";

import { safeAction } from "@/lib/safeAction";
import { useState, useTransition } from "react";
import type { ProjectStage } from "@prisma/client";
import { PROJECT_STAGES } from "@/lib/projectProgress";
import { PROJECT_STAGE_LABEL } from "@/lib/projectTasks";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { setTaskStage } from "./actions";

/** Stage picker for one variant. Saves on change; on failure it reverts and shows the reason. */
export function StageSelect({ projectId, taskId, value, label }: { projectId: string; taskId: string; value: ProjectStage | null; label: string }) {
  const [stage, setStage] = useState<ProjectStage | null>(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    const prev = stage;
    const nextStage = next as ProjectStage;
    setStage(nextStage);
    setError(null);
    startTransition(async () => {
      const r = await safeAction(() => setTaskStage(projectId, taskId, nextStage));
      if (!r.ok) {
        setStage(prev);
        setError(r.message);
      }
    });
  }

  return (
    <div className="grid gap-1">
      <Select value={stage ?? undefined} onValueChange={change} disabled={pending}>
        <SelectTrigger size="sm" className="w-44" aria-label={`Stage for ${label}`}>
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          {PROJECT_STAGES.map((st) => (
            <SelectItem key={st} value={st}>{PROJECT_STAGE_LABEL[st]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
