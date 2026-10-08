"use client";

import { useId, useState, useTransition } from "react";
import type { JobRole } from "@prisma/client";
import { setTarget } from "@/app/(app)/dashboard/targets/actions";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { fieldClass } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";

/** Inline target editor for one team row. Typed input is kept when a save fails. Saving never touches a stored note. */
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
        // No note is sent, so the server keeps whatever note the target already has.
        const r = await setTarget(userId, month, role, n);
        setStatus(r.ok ? { kind: "ok", text: "Saved." } : { kind: "error", text: r.message });
      } catch {
        setStatus({ kind: "error", text: "Could not save. Please try again." });
      }
    });
  }

  return (
    // One line per person: [target][Save]. The status message (if any) sits under it, so rows stay short.
    <form onSubmit={save} data-target-editor="" className="flex w-full min-w-40 flex-wrap items-center gap-1.5 py-1">
      <label htmlFor={id} className="sr-only">Target tasks for {name}</label>
      <input id={id} type="number" inputMode="numeric" min={0} max={10000} step={1} value={value}
        onChange={(e) => { setValue(e.target.value); setStatus(null); }}
        className={fieldClass({ size: "sm", className: "w-20 shrink-0 tabular-nums" })} />
      <Button type="submit" variant="primary" size="sm" loading={pending} aria-label={`Save target for ${name}`} title={`Save target for ${name}`}
        icon={<Check aria-hidden="true" />} className="w-8 shrink-0 px-0">
        <span className="sr-only">{pending ? "Saving…" : "Save"}</span>
      </Button>
      <span role="status" aria-live="polite" className={cn("w-full text-xs empty:hidden", status?.kind === "error" ? "text-danger" : "text-foreground-secondary")}>
        {status?.text}
      </span>
    </form>
  );
}
