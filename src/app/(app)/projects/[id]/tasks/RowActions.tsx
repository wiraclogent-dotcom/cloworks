"use client";

import { safeAction } from "@/lib/safeAction";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { deleteTask, moveTask } from "./actions";

/** Move up / move down / delete for one row while it is being edited. Delete asks for a second click to confirm. */
export function RowActions({ projectId, taskId, label, isFirst, isLast }: {
  projectId: string; taskId: string; label: string; isFirst: boolean; isLast: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await safeAction(action);
      if (!r.ok) setError(r.message);
      setConfirming(false);
    });
  }

  if (confirming) {
    return (
      <div role="group" aria-label={`Confirm deleting ${label}`} className="flex flex-wrap items-center gap-1.5 text-xs">
        <span>Delete this row?</span>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => deleteTask(projectId, taskId))}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)} autoFocus>Cancel</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <IconButton size="sm" className="size-7 [&_svg]:size-3.5" title="Move up" aria-label={`Move ${label} up`} icon={<ArrowUp aria-hidden="true" />}
        disabled={pending || isFirst} onClick={() => run(() => moveTask(projectId, taskId, "up"))} />
      <IconButton size="sm" className="size-7 [&_svg]:size-3.5" title="Move down" aria-label={`Move ${label} down`} icon={<ArrowDown aria-hidden="true" />}
        disabled={pending || isLast} onClick={() => run(() => moveTask(projectId, taskId, "down"))} />
      <IconButton size="sm" className="size-7 text-danger hover:text-danger [&_svg]:size-3.5" title="Delete row" aria-label={`Delete ${label}`} icon={<Trash2 aria-hidden="true" />}
        disabled={pending} onClick={() => { setError(null); setConfirming(true); }} />
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </div>
  );
}
