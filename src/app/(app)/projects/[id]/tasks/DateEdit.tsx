"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { setTaskDate } from "./actions";
import { formatJakartaDay } from "@/lib/projectTasks";

/**
 * A start or due date. Click it to open a small floating panel with a date input; picking a day saves and closes.
 * The panel floats over the table, so the row keeps its width.
 */
export function DateEdit({ projectId, taskId, field, iso, text, label }: {
  projectId: string; taskId: string; field: "start" | "due"; iso: string | null; text: string; label: string;
}) {
  const [current, setCurrent] = useState<string | null>(iso);
  const [display, setDisplay] = useState(text);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const what = field === "start" ? "Start date" : "Due date";

  function save(value: string) {
    setError(null);
    startTransition(async () => {
      const r = await setTaskDate(projectId, taskId, field, value);
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
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setError(null); }}>
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
              defaultValue={current ?? ""}
              aria-label={`${what} for ${label}`}
              disabled={pending}
              autoFocus
              onChange={(e) => { if (e.target.value) save(e.target.value); }}
              className="h-9"
            />
          </label>
          <div className="flex items-center justify-between">
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => save("")}>Clear</Button>
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>Close</Button>
          </div>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
