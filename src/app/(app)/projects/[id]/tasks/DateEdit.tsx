"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/shadcn/button";
import { Calendar } from "@/components/shadcn/calendar";
import { isoToLocal, jakartaTodayLocal, localToIso } from "@/components/ui/DatePicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { safeAction } from "@/lib/safeAction";
import { setTaskDate } from "./actions";
import { formatJakartaDay } from "@/lib/projectTasks";

/**
 * A start or due date. Click it to open a small floating panel with a calendar; picking a day only changes the draft,
 * Save writes it and closes (Clear removes the date). It never saves on a pick, so a mis-click is not a write.
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
          className="rounded-md px-1 -mx-1 text-left tabular-nums underline decoration-dotted underline-offset-4 hover:bg-muted"
        >
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-3"
        aria-label={`Choose ${what.toLowerCase()}`}
        onOpenAutoFocus={(e) => {
          // Land on the roving-tabindex day (the draft, else today) so the arrow keys work straight away.
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector<HTMLElement>('button[tabindex="0"]')?.focus();
        }}
      >
        <div className="grid gap-3">
          <div role="group" aria-label={`${what} for ${label}`} className="grid gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">{what}</p>
            <Calendar
              mode="single"
              required
              selected={draft ? isoToLocal(draft) : undefined}
              defaultMonth={(draft ? isoToLocal(draft) : undefined) ?? jakartaTodayLocal()}
              today={jakartaTodayLocal()}
              onSelect={(d) => { if (d && !pending) setDraft(localToIso(d)); }}
            />
          </div>
          <div className="flex items-center justify-between">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => save("")}>Clear</Button>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Close</Button>
              <Button size="sm" variant="default" disabled={pending || !draft || draft === current} onClick={() => save(draft)}>
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
