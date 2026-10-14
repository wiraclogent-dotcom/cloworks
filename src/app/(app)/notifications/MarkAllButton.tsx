"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { safeAction } from "@/lib/safeAction";
import { markAllNotificationsRead } from "./actions";
import { Button } from "@/components/shadcn/button";

export function MarkAllButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="ghost" size="sm" type="button" disabled={disabled || pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await safeAction(markAllNotificationsRead);
            if (r.ok) router.refresh();
            else setError(r.message);
          });
        }}>
        {pending ? "Marking…" : "Mark all as read"}
      </Button>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
