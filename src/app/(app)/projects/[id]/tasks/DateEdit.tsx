"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { safeAction } from "@/lib/safeAction";
import { setTaskDate } from "./actions";
import { formatJakartaDay } from "@/lib/projectTasks";

/**
 * A start or due date. Click it to open a small floating panel with a date input; Save (or Enter) saves and closes.
 * It does not save on change: typing a date fires a change per digit ("2" of "25" is already a valid date).
 * The panel floats over the table, so the row keeps its width.
 */
export function DateEdit({ projectId, taskId, field, iso, text, label }: {
  projectId: string; taskId: string; field: "start" | "due"; iso: string | null; text: string; label: string;
}) {
  const [current, setCurrent] = useState<string | null>(iso);
  const [display, setDisplay] = useState(text);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(iso ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const what = field === "start" ? "Start date" : "Due date";

  function save(value: string) {
    setError(null);
    startTransition(async () => {
      const r = await safeAction(() => setTaskDate(projectId, taskId, field, value));
      if (r.ok) {
        const next = field === "start" ? r.startDate : r.dueDate;
        setCurrent(next);
        setDisplay(next ? formatJakartaDay(next) : "—");
        setOpen(false);
      } else {
        setError(r.message);
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setError(null); setDraft(current ?? ""); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Edit ${what.toLowerCase()} for ${label}: ${display}`}
          className="rounded-md px-1 -mx-1 text-left tabular-nums underline decoration-dotted underline-offset-4 hover:bg-surface-muted"
        >
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-xs font-medium text-foreground-secondary">
            {what}
            <Input
              type="date"
              value={draft}
              aria-label={`${what} for ${label}`}
              disabled={pending}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && draft) { e.preventDefault(); save(draft); } }}
              className="h-9"
            />
          </label>
          <div className="flex items-center justify-between">
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => save("")}>Clear</Button>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>Close</Button>
              <Button type="button" size="sm" disabled={pending || !draft || draft === current} onClick={() => save(draft)}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
