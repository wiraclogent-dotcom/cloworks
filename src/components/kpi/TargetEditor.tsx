"use client";

import { useId, useState, useTransition } from "react";
import type { JobRole } from "@prisma/client";
import { setTarget } from "@/app/(app)/dashboard/targets/actions";

/** Inline target editor for one team row. Typed input is kept when a save fails. */
export function TargetEditor({ userId, name, month, role, initial }: { userId: string; name: string; month: string; role: JobRole; initial: number | null }) {
  const id = useId();
  const [value, setValue] = useState(initial === null ? "" : String(initial));
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
        const r = await setTarget(userId, month, role, n);
        setStatus(r.ok ? { kind: "ok", text: "Saved." } : { kind: "error", text: r.message });
      } catch {
        setStatus({ kind: "error", text: "Could not save. Please try again." });
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="sr-only">Target tasks for {name}</label>
      <input id={id} type="number" inputMode="numeric" min={0} max={10000} step={1} value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
      <button type="submit" disabled={pending}
        className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      <span role="status" aria-live="polite" className={`text-sm ${status?.kind === "error" ? "text-red-700 dark:text-red-300" : "text-muted-foreground"}`}>
        {status?.text}
      </span>
    </form>
  );
}
