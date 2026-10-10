"use client";

import { safeAction } from "@/lib/safeAction";
import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Chip } from "@/components/ui/Chip";
import { fieldClass } from "@/components/ui/Field";
import { formatJakartaDay } from "@/lib/projectTasks";
import { createMilestone, deleteMilestone, updateMilestone, type MilestoneInput } from "./actions";

export type MilestoneRow = { id: string; title: string; dateIso: string; done: boolean };

/** Meetings and milestones for one project. Managers can add, edit and delete them; everyone else sees the list. */
export function MilestoneList({ projectId, milestones, canManage }: { projectId: string; milestones: MilestoneRow[]; canManage: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="grid gap-3">
      {milestones.length === 0 && !adding && (
        <p className="text-sm text-foreground-secondary">No meetings or milestones recorded yet.</p>
      )}
      {milestones.length > 0 && (
        <ul className="grid gap-2">
          {milestones.map((m) => (
            <li key={m.id}>
              {editingId === m.id ? (
                <MilestoneForm
                  initial={{ title: m.title, date: m.dateIso, done: m.done }}
                  submitLabel="Save"
                  label={m.title}
                  onCancel={() => setEditingId(null)}
                  onSubmit={(input) => updateMilestone(projectId, m.id, input)}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <MilestoneItem projectId={projectId} milestone={m} canManage={canManage} onEdit={() => setEditingId(m.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (adding ? (
        <MilestoneForm
          initial={{ title: "", date: "", done: false }}
          submitLabel="Add"
          label="new milestone"
          onCancel={() => setAdding(false)}
          onSubmit={(input) => createMilestone(projectId, input)}
          onDone={() => setAdding(false)}
        />
      ) : (
        <div>
          <Button size="sm" variant="secondary" icon={<Plus aria-hidden="true" />} onClick={() => setAdding(true)}>
            Add milestone
          </Button>
        </div>
      ))}
    </div>
  );
}

function MilestoneItem({ projectId, milestone: m, canManage, onEdit }: {
  projectId: string; milestone: MilestoneRow; canManage: boolean; onEdit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const r = await safeAction(() => deleteMilestone(projectId, m.id));
      if (!r.ok) { setError(r.message); setConfirming(false); }
    });
  }

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>{m.title}</span>
        <span className="flex items-center gap-2 tabular-nums text-foreground-secondary">
          {formatJakartaDay(m.dateIso)}
          <Chip tone={m.done ? "done" : "tag-neutral"}>{m.done ? "Done" : "Upcoming"}</Chip>
          {canManage && !confirming && (
            <>
              <IconButton size="sm" className="size-7 [&_svg]:size-3.5" title="Edit" aria-label={`Edit ${m.title}`} icon={<Pencil aria-hidden="true" />} onClick={onEdit} />
              <IconButton size="sm" title="Delete" aria-label={`Delete ${m.title}`} icon={<Trash2 aria-hidden="true" />}
                className="size-7 text-danger hover:text-danger [&_svg]:size-3.5" onClick={() => { setError(null); setConfirming(true); }} />
            </>
          )}
        </span>
      </div>
      {confirming && (
        <div role="group" aria-label={`Confirm deleting ${m.title}`} className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
          <span>Delete this milestone?</span>
          <Button size="sm" variant="danger" disabled={pending} onClick={remove}>{pending ? "Deleting…" : "Delete"}</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirming(false)} autoFocus>Cancel</Button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function MilestoneForm({ initial, submitLabel, label, onSubmit, onCancel, onDone }: {
  initial: MilestoneInput; submitLabel: string; label: string;
  onSubmit: (input: MilestoneInput) => Promise<{ ok: true } | { ok: false; message: string }>;
  onCancel: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState<MilestoneInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await safeAction(() => onSubmit(form));
      if (r.ok) onDone();
      else setError(r.message);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required disabled={pending}
          placeholder="e.g. Client review" aria-label={`Name for ${label}`} className={fieldClass({ size: "sm", className: "min-w-48 flex-1" })} autoFocus />
        <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} required disabled={pending}
          aria-label={`Date for ${label}`} className={fieldClass({ size: "sm", className: "w-40" })} />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={form.done} onChange={(e) => setForm((f) => ({ ...f, done: e.target.checked }))} disabled={pending} />
          Done
        </label>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" variant="primary" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
