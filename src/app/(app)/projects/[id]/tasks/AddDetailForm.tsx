"use client";

import { safeAction } from "@/lib/safeAction";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { fieldClass } from "@/components/ui/Field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { PROJECT_STAGES } from "@/lib/projectProgress";
import { PROJECT_STAGE_LABEL, TASK_STATUS_LABEL, TASK_STATUS_ORDER } from "@/lib/projectTasks";
import { createTaskDetail, type NewDetailInput } from "./actions";

const NONE = "__none__";
const EMPTY: NewDetailInput = { title: "", subTitle: "", ownerId: NONE, value: NONE, startDate: "", dueDate: "", fileUrl: "" };

/** Add-a-row panel. Opens from a button; the stage or status list follows the project's mode. */
export function AddDetailForm({ projectId, mode, owners }: {
  projectId: string; mode: "stage" | "status"; owners: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewDetailInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const valueOptions = mode === "status"
    ? TASK_STATUS_ORDER.map((st) => ({ value: st, label: TASK_STATUS_LABEL[st] }))
    : PROJECT_STAGES.map((st) => ({ value: st, label: PROJECT_STAGE_LABEL[st] }));
  const valueLabel = mode === "status" ? "Status" : "Stage";

  function set<K extends keyof NewDetailInput>(key: K, value: NewDetailInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await safeAction(() => createTaskDetail(projectId, {
        ...form,
        ownerId: form.ownerId === NONE ? "" : form.ownerId,
        value: form.value === NONE ? "" : form.value,
      }));
      if (r.ok) {
        setForm(EMPTY);
        setOpen(false);
      } else {
        setError(r.message);
      }
    });
  }

  if (!open) {
    return (
      <div className="flex justify-end">
        <Button variant="primary" icon={<Plus aria-hidden="true" />} onClick={() => { setError(null); setOpen(true); }}>
          Add detail
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New detail</CardTitle>
      </CardHeader>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          Item
          <input value={form.title} onChange={(e) => set("title", e.target.value)} required disabled={pending} placeholder="e.g. Shoe Foam" className={fieldClass()} />
        </label>
        <label className="grid gap-1.5 text-sm">
          Detail
          <input value={form.subTitle} onChange={(e) => set("subTitle", e.target.value)} disabled={pending} placeholder="Optional" className={fieldClass()} />
        </label>
        <div className="grid gap-1.5 text-sm">
          Owner
          <Select value={form.ownerId} onValueChange={(v) => set("ownerId", v)} disabled={pending}>
            <SelectTrigger aria-label="Owner for new detail"><SelectValue placeholder="Unassigned" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unassigned</SelectItem>
              {owners.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 text-sm">
          {valueLabel}
          <Select value={form.value} onValueChange={(v) => set("value", v)} disabled={pending}>
            <SelectTrigger aria-label={`${valueLabel} for new detail`}><SelectValue placeholder="Not set" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {valueOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <label className="grid gap-1.5 text-sm">
          Start
          <input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} disabled={pending} className={fieldClass()} />
        </label>
        <label className="grid gap-1.5 text-sm">
          Due
          <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} disabled={pending} className={fieldClass()} />
        </label>
        <label className="grid gap-1.5 text-sm sm:col-span-2">
          File link
          <input type="url" value={form.fileUrl} onChange={(e) => set("fileUrl", e.target.value)} disabled={pending} placeholder="https://" className={fieldClass()} />
        </label>
        {error && <p role="alert" className="text-sm text-danger sm:col-span-2">{error}</p>}
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" disabled={pending} onClick={() => { setForm(EMPTY); setError(null); setOpen(false); }}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Adding…" : "Add detail"}</Button>
        </div>
      </form>
    </Card>
  );
}
