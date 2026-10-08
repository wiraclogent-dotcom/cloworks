"use client";

import { useId, useState, useTransition } from "react";
import type { JobRole } from "@prisma/client";
import { setTarget } from "@/app/(app)/dashboard/targets/actions";
import { Button } from "@/components/ui/Button";
import { fieldClass } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";

/** Inline target editor for one team row. Typed input is kept when a save fails. */
export function TargetEditor({ userId, name, month, role, initial, initialNote = null }: { userId: string; name: string; month: string; role: JobRole; initial: number | null; initialNote?: string | null }) {
  const id = useId();
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [note, setNote] = useState(initialNote ?? "");
  const [storedNote, setStoredNote] = useState((initialNote ?? "").trim());
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    const n = value.trim() === "" ? NaN : Number(value);
    if (!Number.isInteger(n)) {
      setStatus({ kind: "error", text: "Enter a whole number." });
      return;
    }
    start(async () => {
      try {
        // Pass the note only when changed: omitted keeps the stored note, "" clears it.
        const noteChanged = note.trim() !== storedNote;
        const r = noteChanged ? await setTarget(userId, month, role, n, note.trim()) : await setTarget(userId, month, role, n);
        if (r.ok && noteChanged) setStoredNote(note.trim());
        setStatus(r.ok ? { kind: "ok", text: "Saved." } : { kind: "error", text: r.message });
      } catch {
        setStatus({ kind: "error", text: "Could not save. Please try again." });
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2 py-0.5">
      <label htmlFor={id} className="sr-only">Target tasks for {name}</label>
      <input id={id} type="number" inputMode="numeric" min={0} max={10000} step={1} value={value}
        onChange={(e) => { setValue(e.target.value); setStatus(null); }}
        className={fieldClass({ size: "sm", className: "w-20 tabular-nums" })} />
      <label htmlFor={`${id}-note`} className="sr-only">Note for {name} (optional, up to 200 characters)</label>
      <input id={`${id}-note`} type="text" maxLength={200} placeholder="Note (optional)" value={note}
        onChange={(e) => { setNote(e.target.value); setStatus(null); }}
        className={fieldClass({ size: "sm", className: "w-44" })} />
      <Button type="submit" variant="primary" size="sm" loading={pending} aria-label={`Save target for ${name}`}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <span role="status" aria-live="polite" className={cn("text-[13px]", status?.kind === "error" ? "text-danger" : "text-foreground-secondary")}>
        {status?.text}
      </span>
    </form>
  );
}
