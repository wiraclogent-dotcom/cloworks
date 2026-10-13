"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { removeProjectTarget } from "@/app/(app)/dashboard/projects/actions";
import { IconButton } from "@/components/ui/IconButton";

/** The × on a target row. Removing is undoable (add it again), so there is no confirm step; a failure shows under the row. */
export function RemoveTargetButton({ targetId, label }: { targetId: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function remove() {
    setError(null);
    start(async () => {
      try {
        const r = await removeProjectTarget(targetId);
        if (!r.ok) setError(r.message);
      } catch {
        setError("Could not remove the target. Please try again.");
      }
    });
  }
  return (
    <>
      <IconButton size="sm" aria-label={`Remove target ${label}`} icon={<X />} disabled={pending} onClick={remove} />
      <span role="alert" className="basis-full text-xs text-danger empty:hidden">{error}</span>
    </>
  );
}
