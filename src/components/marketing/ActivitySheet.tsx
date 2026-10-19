"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteActivity, saveActivity } from "@/app/(app)/marketing/actions";
import { safeAction } from "@/lib/safeAction";
import { relativeTime } from "@/lib/relativeTime";
import { STATUS_LABEL, rangeLabel } from "@/lib/marketing/format";
import { MARKETING_STATUSES, type CalActivity, type MarketingMonthData, type MarketingStatus } from "@/lib/marketing/types";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/shadcn/sheet";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { NativeSelect } from "@/components/shadcn/native-select";
import { FieldError } from "@/components/shadcn/field";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { DatePicker } from "@/components/ui/DatePicker";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import type { SheetState } from "./sheetState";

/**
 * The page's one activity sheet (spec 2026-10-19): a form for someone who may edit the activity's division (or a new
 * activity), otherwise a read-only summary.
 */
export function ActivitySheet({ data, state, onClose }: { data: MarketingMonthData; state: SheetState; onClose: () => void }) {
  const activity = state?.mode === "edit" ? data.activities.find((a) => a.id === state.activityId) ?? null : null;
  const open = state !== null && (state.mode === "new" || activity !== null);
  const canEdit = state?.mode === "new" ? data.editableDivisionIds.length > 0 : activity !== null && data.editableDivisionIds.includes(activity.divisionId);
  const key = state?.mode === "edit" ? state.activityId : `new-${state?.divisionId ?? ""}-${state?.day ?? ""}`;
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent>
        {open && canEdit ? <ActivityForm key={key} data={data} activity={activity} preset={state?.mode === "new" ? state : null} onDone={onClose} /> : null}
        {open && !canEdit && activity ? <ActivitySummary data={data} activity={activity} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function ActivitySummary({ data, activity: a }: { data: MarketingMonthData; activity: CalActivity }) {
  const division = data.divisions.find((d) => d.id === a.divisionId);
  return (
    <>
      <SheetHeader><SheetTitle>{a.title}</SheetTitle><SheetDescription>{division?.name ?? "Division"} · {rangeLabel(a.startDay, a.endDay)}</SheetDescription></SheetHeader>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 px-4 text-sm">
        <dt className="text-muted-foreground">Division</dt>
        <dd data-tone={division?.tone} className="flex items-center gap-1.5 text-foreground">
          <span aria-hidden="true" className="size-2.5 rounded-xs bg-tone-accent" />{division?.name}
        </dd>
        <dt className="text-muted-foreground">Dates</dt><dd className="text-foreground">{rangeLabel(a.startDay, a.endDay)}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd><span data-tone={division?.tone} className="rounded-md bg-tone-tint px-1.5 py-0.5 text-xs font-medium text-tone-text">{STATUS_LABEL[a.status]}</span></dd>
      </dl>
      <p className="mt-4 px-4 text-compact text-muted-foreground">Last edited by {a.updatedByName} · {relativeTime(new Date(a.updatedAt), new Date())}</p>
    </>
  );
}

function ActivityForm({ data, activity, preset, onDone }: {
  data: MarketingMonthData; activity: CalActivity | null; preset: { divisionId?: string; day?: string } | null; onDone: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const choices = data.divisions.filter((d) => data.editableDivisionIds.includes(d.id));
  const firstDay = preset?.day ?? (data.today.slice(0, 7) === data.month ? data.today : `${data.month}-01`);
  const [title, setTitle] = useState(activity?.title ?? "");
  const [divisionId, setDivisionId] = useState(activity?.divisionId ?? (preset?.divisionId && choices.some((c) => c.id === preset.divisionId) ? preset.divisionId : choices[0]?.id ?? ""));
  const [startDay, setStartDay] = useState<string | null>(activity?.startDay ?? firstDay);
  const [endDay, setEndDay] = useState<string | null>(activity?.endDay ?? firstDay);
  const [endTouched, setEndTouched] = useState(activity !== null);
  const [status, setStatus] = useState<MarketingStatus>(activity?.status ?? "PLANNED");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await safeAction(() => saveActivity(activity?.id ?? null, { title, divisionId, startDay: startDay ?? "", endDay: endDay ?? "", status }));
      if (res.ok) { onDone(); router.refresh(); return; }
      const fieldErrors = "fieldErrors" in res ? res.fieldErrors : undefined;
      setErrors(fieldErrors ?? {});
      setMessage(fieldErrors ? null : res.message);
    });
  }
  function remove() {
    if (!activity) return;
    start(async () => {
      const res = await safeAction(() => deleteActivity(activity.id));
      setConfirming(false);
      if (res.ok) { onDone(); router.refresh(); } else setMessage(res.message);
    });
  }
  const err = (k: string) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `${id}-${k}-error` } : {});

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader><SheetTitle>{activity ? "Edit activity" : "New activity"}</SheetTitle></SheetHeader>
      <div className="flex-1 space-y-4 px-4">
        {message ? <Alert variant="destructive"><AlertDescription><p>{message}</p></AlertDescription></Alert> : null}
        <div>
          <Label htmlFor={`${id}-title`} className="mb-1.5">Title</Label>
          <Input id={`${id}-title`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} {...err("title")} />
          <FieldError id={`${id}-title-error`}>{errors.title}</FieldError>
        </div>
        <div>
          <Label htmlFor={`${id}-division`} className="mb-1.5">Division</Label>
          <NativeSelect id={`${id}-division`} value={divisionId} onChange={(e) => setDivisionId(e.target.value)} {...err("divisionId")}>
            {choices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </NativeSelect>
          <FieldError id={`${id}-divisionId-error`}>{errors.divisionId}</FieldError>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label id={`${id}-start`} className="mb-1.5">Start date</Label>
            <DatePicker value={startDay} aria-labelledby={`${id}-start`} {...err("startDay")}
              onChange={(v) => { setStartDay(v); if (v && (!endTouched || !endDay || endDay < v)) setEndDay(v); }} />
            <FieldError id={`${id}-startDay-error`}>{errors.startDay}</FieldError>
          </div>
          <div>
            <Label id={`${id}-end`} className="mb-1.5">End date</Label>
            <DatePicker value={endDay} min={startDay ?? undefined} aria-labelledby={`${id}-end`} {...err("endDay")}
              onChange={(v) => { setEndDay(v); setEndTouched(true); }} />
            <FieldError id={`${id}-endDay-error`}>{errors.endDay}</FieldError>
          </div>
        </div>
        {startDay && startDay === endDay ? <p className="-mt-2 text-compact text-muted-foreground">One day</p> : null}
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Status</p>
          <SegmentedControl label="Status" value={status}
            items={MARKETING_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s], onSelect: () => setStatus(s) }))} />
          <FieldError id={`${id}-status-error`}>{errors.status}</FieldError>
        </div>
      </div>
      <SheetFooter className="flex-row flex-wrap justify-end">
        {activity ? (
          <Button type="button" variant="ghost" className="mr-auto text-danger" icon={<Trash2 aria-hidden="true" strokeWidth={1.75} />} onClick={() => setConfirming(true)}>Delete</Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="default" loading={pending}>Save</Button>
      </SheetFooter>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this activity?</AlertDialogTitle>
            <AlertDialogDescription>It disappears from the Marketing Calendar for everyone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={(e) => { e.preventDefault(); remove(); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
