"use client";

import { useId, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { addProjectTargets, loadItemOptions, type ItemOption } from "@/app/(app)/dashboard/projects/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { NativeSelect } from "@/components/shadcn/native-select";
import { Label, labelClassName } from "@/components/shadcn/label";
import { LibraryDialog } from "@/components/library/LibraryDialog";

/**
 * "Manage targets" for one person and year: pick a project, tick the items to add. Items already targeted on this
 * person are shown ticked and locked; items targeted on someone else say so. Failures show in an Alert and keep the
 * dialog open with the ticks intact.
 */
export function ManageTargetsModal({ userId, name, year, projects }: {
  userId: string; name: string; year: number; projects: { id: string; title: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="default" icon={<Plus aria-hidden="true" />} onClick={() => setOpen(true)}>Manage targets</Button>
      {open ? <Picker userId={userId} name={name} year={year} projects={projects} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Picker({ userId, name, year, projects, onClose }: {
  userId: string; name: string; year: number; projects: { id: string; title: string }[]; onClose: () => void;
}) {
  const uid = useId();
  const [projectId, setProjectId] = useState("");
  const [options, setOptions] = useState<ItemOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const latest = useRef(0); // ignores a slow answer for a project the user has already moved off

  async function choose(id: string) {
    const mine = ++latest.current;
    setProjectId(id);
    setOptions(null);
    setPicked(new Set());
    setError(null);
    if (!id) { setLoading(false); return; }
    setLoading(true);
    try {
      const r = await loadItemOptions(id, year);
      if (latest.current !== mine) return;
      if (r.ok) setOptions(r.options);
      else setError(r.message);
    } catch {
      if (latest.current === mine) setError("Could not load the items. Please try again.");
    }
    if (latest.current === mine) setLoading(false);
  }

  const toggle = (title: string) => setPicked((s) => {
    const next = new Set(s);
    if (next.has(title)) next.delete(title); else next.add(title);
    return next;
  });

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (picked.size === 0) return;
    setError(null);
    startSave(async () => {
      try {
        const r = await addProjectTargets({ userId, year, projectId, itemTitles: [...picked] });
        if (r.ok) onClose();
        else setError(r.message);
      } catch {
        setError("Could not save. Please try again.");
      }
    });
  }

  return (
    <LibraryDialog title={`Manage targets · ${name} · ${year}`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <Label htmlFor={`${uid}-project`}>Project</Label>
          <NativeSelect id={`${uid}-project`} value={projectId} onChange={(e) => void choose(e.target.value)}>
            <option value="">Choose a project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </NativeSelect>
        </div>

        {loading ? <p role="status" className="text-sm text-muted-foreground">Loading items…</p> : null}
        {options && options.length === 0 ? <p className="text-sm text-muted-foreground">This project has no items yet.</p> : null}
        {options && options.length > 0 ? (
          <fieldset className="space-y-1">
            <legend className={labelClassName}>Items to add as targets for {name}</legend>
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {options.map((o) => {
                const mine = o.assignedTo.some((a) => a.userId === userId);
                const others = o.assignedTo.filter((a) => a.userId !== userId);
                return (
                  <li key={o.itemTitle}>
                    <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm text-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:text-muted-foreground">
                      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" disabled={mine} checked={mine || picked.has(o.itemTitle)}
                        onChange={() => toggle(o.itemTitle)} />
                      <span className="min-w-0 break-words">
                        {o.itemTitle}
                        {mine ? <span className="ml-1.5 text-xs text-muted-foreground">(already a target)</span> : null}
                        {others.length > 0 ? <span className="ml-1.5 text-xs text-muted-foreground">{`· also ${others.map((a) => a.name).join(", ")}`}</span> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : null}

        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="default" loading={saving} disabled={picked.size === 0}>Save</Button>
        </div>
      </form>
    </LibraryDialog>
  );
}
