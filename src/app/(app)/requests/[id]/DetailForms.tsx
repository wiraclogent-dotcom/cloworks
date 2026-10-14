"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RequestStatus } from "@prisma/client";
import { addAttachment, addComment, setAssignees, removeAttachment, setIncludeKpi, setNeedsMotion } from "./actions";
import { celebrate } from "@/lib/celebrate";
import { moveRequest, rescheduleRequest } from "../actions";
import { DoneDialog } from "@/components/DoneDialog";
import { MOVE_TARGETS, STATUS_LABEL } from "@/components/status";
import { canTransition } from "@/lib/workflow";
import { CircleAlert, Link2, MessageSquarePlus, Trash2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/shadcn/button";
import { cn, focusRing } from "@/components/ui/cn";
import type { AssigneeOption, AssigneeRef } from "@/lib/assignees";
import { NativeSelect } from "@/components/shadcn/native-select";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Label, labelClassName } from "@/components/shadcn/label";
import { FieldDescription } from "@/components/shadcn/field";
import { Switch } from "@/components/ui/Switch";

function ErrorLine({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-compact font-medium text-danger">
      <CircleAlert aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}

/** Controlled so a failed post keeps what the user typed; cleared only on success. */
export function CommentForm({ requestId }: { requestId: string }) {
  const uid = useId();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const r = await addComment(requestId, body);
        if (r.ok) { setBody(""); router.refresh(); } else setError(r.message);
      } catch {
        setError("Could not post the comment. Check your connection and try again.");
      }
    });
  }
  return (
    <form onSubmit={submit} noValidate>
      <Label htmlFor={`${uid}-b`}>Add a comment</Label>
      <Textarea id={`${uid}-b`} value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={5000}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-e` : `${uid}-h`} />
      <ErrorLine id={`${uid}-e`} message={error} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p id={`${uid}-h`} className="text-xs text-muted-foreground">Type @ and a name to mention a teammate.</p>
        <Button type="submit" variant="default" size="sm" loading={pending} icon={<MessageSquarePlus aria-hidden="true" strokeWidth={1.75} />}>{pending ? "Posting…" : "Post comment"}</Button>
      </div>
    </form>
  );
}

export function AttachmentForm({ requestId }: { requestId: string }) {
  const uid = useId();
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const r = await addAttachment(requestId, { name, url });
        if (r.ok) { setName(""); setUrl(""); router.refresh(); } else setError(r.message);
      } catch {
        setError("Could not add the link. Check your connection and try again.");
      }
    });
  }
  return (
    <form onSubmit={submit} noValidate>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:items-end">
        <div>
          <Label htmlFor={`${uid}-n`}>Link name</Label>
          <Input id={`${uid}-n`} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
        </div>
        <div>
          <Label htmlFor={`${uid}-u`}>Link address</Label>
          <Input id={`${uid}-u`} type="text" inputMode="url" autoComplete="off" maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or \\server\folder" aria-invalid={!!error || undefined} aria-describedby={error ? `${uid}-e` : undefined} />
        </div>
        <Button type="submit" variant="outline" loading={pending} icon={<Link2 aria-hidden="true" strokeWidth={1.75} />}>{pending ? "Adding…" : "Add link"}</Button>
      </div>
      <ErrorLine id={`${uid}-e`} message={error} />
    </form>
  );
}

export function RemoveAttachmentButton({ requestId, attachmentId, name }: { requestId: string; attachmentId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span>
      <Button variant="ghost" size="sm" type="button" disabled={pending} aria-label={`Remove link “${name}”`}
        onClick={() => start(async () => {
          setError(null);
          try {
            const r = await removeAttachment(requestId, attachmentId);
            if (r.ok) router.refresh(); else setError(r.message);
          } catch { setError("Could not remove the link."); }
        })}>
        <Trash2 aria-hidden="true" strokeWidth={1.75} />Remove
      </Button>
      {error && <span role="alert" className="ml-2 text-compact text-danger">{error}</span>}
    </span>
  );
}

/**
 * Chips for the people on a request, each removable, plus a native select to add someone. Each click sends one change
 * (add or remove one person), which the server applies to the current rows, so a stale page never undoes someone
 * else's edit. Optimistic: the list changes at once and reverts with the server message if the change is refused.
 * Off-team options (a current assignee who has left the team) are never offered to add: the server would refuse them. Stays mounted (local list re-syncs when the
 * server's list changes) and moves focus to the add select after each change, so keyboard users keep their place.
 * While a change is in flight the controls are aria-disabled, not disabled, so they keep focus; extra changes are ignored.
 */
export function AssigneesPicker({ requestId, current, options }: { requestId: string; current: AssigneeRef[]; options: AssigneeOption[] }) {
  const uid = useId();
  const router = useRouter();
  const [list, setList] = useState<AssigneeRef[]>(current);
  const currentKey = current.map((p) => p.id).join(",");
  const [seenKey, setSeenKey] = useState(currentKey);
  if (currentKey !== seenKey) { setSeenKey(currentKey); setList(current); }
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const wantFocus = useRef(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    const sel = selectRef.current;
    if (sel && !sel.disabled) sel.focus(); else groupRef.current?.focus();
  });
  function apply(change: { add: AssigneeRef } | { remove: AssigneeRef }) {
    if (busy.current) return;
    busy.current = true;
    wantFocus.current = true;
    const prev = list;
    setList("add" in change ? [...list, change.add] : list.filter((p) => p.id !== change.remove.id));
    setError(null);
    start(async () => {
      try {
        const r = await setAssignees(requestId, "add" in change ? { add: [change.add.id] } : { remove: [change.remove.id] });
        if (r.ok) router.refresh(); else { setList(prev); setError(r.message); }
      } catch {
        setList(prev);
        setError("Could not change the assignees. Try again.");
      } finally {
        busy.current = false;
      }
    });
  }
  const chosen = new Set(list.map((p) => p.id));
  const addable = options.filter((o) => !chosen.has(o.id) && !o.offTeam);
  return (
    <div ref={groupRef} tabIndex={-1} role="group" aria-labelledby={`${uid}-l`} className="outline-none">
      <span id={`${uid}-l`} className={labelClassName}>Assignees</span>
      {list.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {list.map((p) => (
            <li key={p.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted py-0.5 pl-1 pr-0.5 text-compact text-foreground">
              <Avatar name={p.name} size="sm" decorative />
              <span className="min-w-0 truncate">{p.name}</span>
              <button type="button" aria-disabled={pending || undefined} aria-label={`Remove ${p.name}`} onClick={() => apply({ remove: p })}
                className={cn("inline-flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground aria-disabled:opacity-50", focusRing)}>
                <X aria-hidden="true" strokeWidth={1.75} className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <NativeSelect ref={selectRef} aria-label="Add assignee" value="" disabled={addable.length === 0} aria-disabled={pending || undefined} aria-describedby={error ? `${uid}-e` : undefined}
        onChange={(e) => {
          const pick = addable.find((o) => o.id === e.target.value);
          if (pick) apply({ add: { id: pick.id, name: pick.name } });
        }}>
        <option value="">+ Add person</option>
        {addable.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </NativeSelect>
      <ErrorLine id={`${uid}-e`} message={error} />
    </div>
  );
}

/** Same legal-move menu and Done dialog as the board, for one request. */
export function MoveControl({ requestId, title, status }: { requestId: string; title: string; status: RequestStatus }) {
  const uid = useId();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingDone, setPendingDone] = useState(false);
  const [pending, start] = useTransition();
  const legal = MOVE_TARGETS.filter((s) => canTransition(status, s));
  if (legal.length === 0) return null;
  function move(to: RequestStatus, opts?: { outputCount?: number; designFolderUrl?: string }) {
    setError(null);
    start(async () => {
      try {
        const r = await moveRequest(requestId, to, opts);
        if (r.ok && to === "DONE") celebrate();
        if (r.ok) router.refresh(); else setError(r.message);
      } catch {
        setError("Could not move the request. Check your connection and try again.");
      }
    });
  }
  return (
    <div>
      <Label htmlFor={`${uid}-m`}>Move to…</Label>
      <NativeSelect id={`${uid}-m`} value="" disabled={pending} aria-describedby={`${uid}-mh`}
        onChange={(e) => { const to = e.target.value as RequestStatus; if (!to) return; if (to === "DONE") setPendingDone(true); else move(to); }}>
        <option value="">Choose a status</option>
        {legal.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </NativeSelect>
      <FieldDescription id={`${uid}-mh`}>{status === "CANCELLED" ? "Choose Requested to restore this request." : legal.includes("CANCELLED") ? "Choose Cancelled to cancel this request." : "Only moves allowed from the current status are listed."}</FieldDescription>
      <ErrorLine id={`${uid}-e`} message={error} />
      {pendingDone && <DoneDialog title={title} onCancel={() => setPendingDone(false)} onSubmit={(d) => { setPendingDone(false); move("DONE", d); }} />}
    </div>
  );
}

/** Pick a new deadline day (Jakarta, YYYY-MM-DD); records history server-side. */
export function DeadlineControl({ requestId, current, minDay }: { requestId: string; current: string | null; minDay: string }) {
  const uid = useId();
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const r = await rescheduleRequest(requestId, value);
        if (r.ok) router.refresh(); else setError(r.message);
      } catch {
        setError("Could not change the deadline. Check your connection and try again.");
      }
    });
  }
  return (
    <form onSubmit={save} noValidate>
      <Label htmlFor={`${uid}-d`}>Change deadline</Label>
      <div className="flex items-center gap-2">
        <Input id={`${uid}-d`} type="date" value={value} min={minDay} disabled={pending} onChange={(e) => setValue(e.target.value)}
          aria-describedby={error ? `${uid}-e` : undefined} aria-invalid={!!error || undefined} />
        <Button type="submit" variant="outline" size="sm" loading={pending} disabled={!value || value === current}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      {error && <Alert variant="destructive" id={`${uid}-e`} className="mt-2"><AlertDescription>{error}</AlertDescription></Alert>}
    </form>
  );
}

/** Lead/admin switch: does this request count toward KPI? Optimistic, reverts with the server message on failure. */
export function IncludeKpiToggle({ requestId, initial }: { requestId: string; initial: boolean }) {
  const uid = useId();
  const router = useRouter();
  const [checked, setChecked] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function change(next: boolean) {
    const prev = checked;
    setChecked(next);
    setError(null);
    start(async () => {
      try {
        const r = await setIncludeKpi(requestId, next);
        if (r.ok) router.refresh(); else { setChecked(prev); setError(r.message); }
      } catch {
        setChecked(prev);
        setError("Could not change this. Check your connection and try again.");
      }
    });
  }
  return (
    <div>
      <Switch id={`${uid}-k`} label="Counts toward KPI" checked={checked} disabled={pending} onChange={(e) => change(e.target.checked)}
        describedBy={error ? `${uid}-e` : undefined} />
      <ErrorLine id={`${uid}-e`} message={error} />
    </div>
  );
}

/** Lead/admin switch: does this task also need motion work? Renders nothing for everyone else (they see the Needs motion chip in the page header). */
export function NeedsMotionToggle({ requestId, initial, canEdit }: { requestId: string; initial: boolean; canEdit: boolean }) {
  const uid = useId();
  const router = useRouter();
  const [checked, setChecked] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!canEdit) return null;
  function change(next: boolean) {
    const prev = checked;
    setChecked(next);
    setError(null);
    start(async () => {
      try {
        const r = await setNeedsMotion(requestId, next);
        if (r.ok) router.refresh(); else { setChecked(prev); setError(r.message); }
      } catch {
        setChecked(prev);
        setError("Could not change this. Check your connection and try again.");
      }
    });
  }
  return (
    <div>
      <Switch id={`${uid}-m`} label="Needs motion" checked={checked} disabled={pending} onChange={(e) => change(e.target.checked)}
        describedBy={error ? `${uid}-e` : undefined} />
      <ErrorLine id={`${uid}-e`} message={error} />
    </div>
  );
}
