"use client";

import { safeAction } from "@/lib/safeAction";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/shadcn/button";
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
        <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => run(() => deleteTask(projectId, taskId))}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)} autoFocus>Cancel</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <Button type="button" size="icon" variant="ghost" className="size-7" title="Move up" aria-label={`Move ${label} up`}
        disabled={pending || isFirst} onClick={() => run(() => moveTask(projectId, taskId, "up"))}>
        <ArrowUp aria-hidden="true" className="size-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-7" title="Move down" aria-label={`Move ${label} down`}
        disabled={pending || isLast} onClick={() => run(() => moveTask(projectId, taskId, "down"))}>
        <ArrowDown aria-hidden="true" className="size-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-7 text-danger" title="Delete row" aria-label={`Delete ${label}`}
        disabled={pending} onClick={() => { setError(null); setConfirming(true); }}>
        <Trash2 aria-hidden="true" className="size-3.5" />
      </Button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </div>
  );
}
