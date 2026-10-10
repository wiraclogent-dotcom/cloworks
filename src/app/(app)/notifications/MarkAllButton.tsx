"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import { safeAction } from "@/lib/safeAction";
import { markAllNotificationsRead } from "./actions";

export function MarkAllButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" disabled={disabled || pending} className={buttonClass({ variant: "ghost", size: "sm" })}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await safeAction(markAllNotificationsRead);
            if (r.ok) router.refresh();
            else setError(r.message);
          });
        }}>
        {pending ? "Marking…" : "Mark all as read"}
      </button>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
