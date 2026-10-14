"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { setKpiRoster } from "@/app/(app)/dashboard/team/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { labelClassName } from "@/components/shadcn/label";
import { LibraryDialog } from "@/components/library/LibraryDialog";
import { Checkbox } from "@/components/shadcn/checkbox";

type Props = {
  kind: "REQUESTS" | "PROJECTS";
  /** Everyone who may be shown: active people who are not requesters. */
  candidates: { id: string; name: string }[];
  /** Who the table shows now (pre-ticked). */
  selected: string[];
  /** Requests: the month the table is showing (the automatic rule depends on it). */
  month?: string;
  /** Projects: the year the table is showing. */
  year?: number;
};

/**
 * "Manage people" for Team KPI: tick who appears on the table. Saved as standing exceptions to the automatic rule, so
 * it applies to every month / year. Failures show in an Alert and keep the dialog open with the ticks intact.
 */
export function ManagePeopleDialog(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" icon={<Users aria-hidden="true" />} onClick={() => setOpen(true)}>Manage people</Button>
      {open ? <Picker {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Picker({ kind, candidates, selected, month, year, onClose }: Props & { onClose: () => void }) {
  const router = useRouter();
  const known = new Set(candidates.map((c) => c.id));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(selected.filter((id) => known.has(id))));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const toggle = (id: string) => setPicked((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const userIds = candidates.filter((c) => picked.has(c.id)).map((c) => c.id);
    startSave(async () => {
      try {
        const r = await setKpiRoster(kind === "REQUESTS" ? { kind, userIds, month } : { kind, userIds, year });
        if (r.ok) { onClose(); router.refresh(); }
        else setError(r.message);
      } catch {
        setError("Could not save. Please try again.");
      }
    });
  }

  return (
    <LibraryDialog title={`Manage people · ${kind === "REQUESTS" ? "Requests" : "Projects"} KPI`} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <fieldset className="space-y-1">
          <legend className={labelClassName}>People shown on the team table</legend>
          <p className="mb-1.5 text-xs leading-4 text-muted-foreground">
            This only changes this table. It stays the same for every {kind === "REQUESTS" ? "month" : "year"}; requests, targets and scores are not affected.
          </p>
          {candidates.length === 0 ? <p className="text-sm text-muted-foreground">There is nobody to choose from.</p> : (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {candidates.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-foreground">
                    <Checkbox checked={picked.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                    <span className="min-w-0 break-words">{c.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="default" loading={saving}>Save</Button>
        </div>
      </form>
    </LibraryDialog>
  );
}
