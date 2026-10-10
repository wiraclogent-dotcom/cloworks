"use client";

import { useRef, useState, useTransition } from "react";
import { Input } from "@/components/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { safeAction } from "@/lib/safeAction";
import { setTaskDetail, type TaskDetailField } from "./actions";

/**
 * A text cell for product or variant. Saves when the field loses focus or on Enter; Escape puts back the saved value.
 * `onFail` gets a refused save's message when the row owns the error display: the cell may already be gone by then
 * (the row's Done button blurs the field, which saves, and closes editing in the same click).
 */
export function EditableName({ projectId, taskId, field, value, label, onFail }: {
  projectId: string; taskId: string; field: "title" | "subTitle"; value: string; label: string; onFail?: (message: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const what = field === "title" ? "Item" : "Detail";
  // Escape blurs the field, and blur saves; the blur handler still sees the edited draft, so it must skip that save.
  const discarding = useRef(false);

  function commit() {
    if (discarding.current) { discarding.current = false; return; }
    const next = draft.trim();
    if (next === saved.trim()) return;
    setError(null);
    startTransition(async () => {
      const r = await safeAction(() => setTaskDetail(projectId, taskId, field as TaskDetailField, next));
      if (r.ok) setSaved(next);
      else { setDraft(saved); if (onFail) onFail(r.message); else setError(r.message); }
    });
  }

  return (
    <div className="grid gap-1">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { discarding.current = true; setDraft(saved); e.currentTarget.blur(); }
        }}
        aria-label={`${what} name for ${label}`}
        placeholder={field === "subTitle" ? "No detail" : undefined}
        disabled={pending}
        className="h-8 min-w-36"
      />
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

const UNASSIGNED = "__unassigned__";

/** Owner picker for one variant. Saves on selection. */
export function OwnerSelect({ projectId, taskId, value, owners, label }: {
  projectId: string; taskId: string; value: string | null; owners: { id: string; name: string }[]; label: string;
}) {
  const [owner, setOwner] = useState<string>(value ?? UNASSIGNED);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    const prev = owner;
    setOwner(next);
    setError(null);
    startTransition(async () => {
      const r = await safeAction(() => setTaskDetail(projectId, taskId, "owner", next === UNASSIGNED ? "" : next));
      if (!r.ok) { setOwner(prev); setError(r.message); }
    });
  }

  return (
    <div className="grid gap-1">
      <Select value={owner} onValueChange={change} disabled={pending}>
        <SelectTrigger size="sm" className="w-40" aria-label={`Owner for ${label}`}>
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          {owners.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
        </SelectContent>
      </Select>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
