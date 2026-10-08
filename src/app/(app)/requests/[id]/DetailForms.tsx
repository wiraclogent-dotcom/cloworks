"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RequestStatus } from "@prisma/client";
import { addAttachment, addComment, assignRequest, removeAttachment, setIncludeKpi, setNeedsMotion } from "./actions";
import { moveRequest, rescheduleRequest } from "../actions";
import { DoneDialog } from "@/components/DoneDialog";
import { MOVE_TARGETS, STATUS_LABEL } from "@/components/status";
import { canTransition } from "@/lib/workflow";
import { CircleAlert, Link2, MessageSquarePlus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClass } from "@/components/ui/Button";
import { fieldClass, hintClass, labelClass } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";

function ErrorLine({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-[13px] font-medium text-danger">
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
      <label htmlFor={`${uid}-b`} className={labelClass}>Add a comment</label>
      <textarea id={`${uid}-b`} value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={5000}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-e` : `${uid}-h`} className={fieldClass({ kind: "textarea", invalid: !!error })} />
      <ErrorLine id={`${uid}-e`} message={error} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p id={`${uid}-h`} className="text-xs text-foreground-secondary">Type @ and a name to mention a teammate.</p>
        <Button type="submit" variant="primary" size="sm" loading={pending} icon={<MessageSquarePlus aria-hidden="true" strokeWidth={1.75} />}>{pending ? "Posting…" : "Post comment"}</Button>
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
          <label htmlFor={`${uid}-n`} className={labelClass}>Link name</label>
          <input id={`${uid}-n`} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={fieldClass()} />
        </div>
        <div>
          <label htmlFor={`${uid}-u`} className={labelClass}>Link address</label>
          <input id={`${uid}-u`} type="url" maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={fieldClass({ invalid: !!error })} aria-describedby={error ? `${uid}-e` : undefined} />
        </div>
        <Button type="submit" variant="secondary" loading={pending} icon={<Link2 aria-hidden="true" strokeWidth={1.75} />}>{pending ? "Adding…" : "Add link"}</Button>
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
      <button type="button" disabled={pending} aria-label={`Remove link “${name}”`}
        onClick={() => start(async () => {
          setError(null);
          try {
            const r = await removeAttachment(requestId, attachmentId);
            if (r.ok) router.refresh(); else setError(r.message);
          } catch { setError("Could not remove the link."); }
        })}
        className={buttonClass({ variant: "ghost", size: "sm" })}>
        <Trash2 aria-hidden="true" strokeWidth={1.75} />Remove
      </button>
      {error && <span role="alert" className="ml-2 text-[13px] text-danger">{error}</span>}
    </span>
  );
}

export function AssigneePicker({ requestId, current, options }: { requestId: string; current: string | null; options: { id: string; name: string }[] }) {
  const uid = useId();
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function change(next: string) {
    const prev = value;
    setValue(next);
    setError(null);
    start(async () => {
      try {
        const r = await assignRequest(requestId, next || null);
        if (r.ok) router.refresh(); else { setValue(prev); setError(r.message); }
      } catch {
        setValue(prev);
        setError("Could not change the assignee. Try again.");
      }
    });
  }
  return (
    <div>
      <label htmlFor={`${uid}-a`} className={labelClass}>Assignee</label>
      <select id={`${uid}-a`} value={value} disabled={pending} onChange={(e) => change(e.target.value)} className={fieldClass({ kind: "select" })}>
        <option value="">Unassigned</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
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
        if (r.ok) router.refresh(); else setError(r.message);
      } catch {
        setError("Could not move the request. Check your connection and try again.");
      }
    });
  }
  return (
    <div>
      <label htmlFor={`${uid}-m`} className={labelClass}>Move to…</label>
      <select id={`${uid}-m`} value="" disabled={pending} aria-describedby={`${uid}-mh`}
        onChange={(e) => { const to = e.target.value as RequestStatus; if (!to) return; if (to === "DONE") setPendingDone(true); else move(to); }}
        className={fieldClass({ kind: "select" })}>
        <option value="">Choose a status</option>
        {legal.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <p id={`${uid}-mh`} className={hintClass}>{legal.includes("CANCELLED") ? "Choose Cancelled to cancel this request." : "Only moves allowed from the current status are listed."}</p>
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
      <label htmlFor={`${uid}-d`} className={labelClass}>Deadline</label>
      <div className="flex items-center gap-2">
        <input id={`${uid}-d`} type="date" value={value} min={minDay} disabled={pending} onChange={(e) => setValue(e.target.value)}
          aria-describedby={error ? `${uid}-e` : undefined} className={fieldClass({ invalid: !!error })} />
        <Button type="submit" variant="secondary" size="sm" loading={pending} disabled={!value || value === current}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      {error && <Alert tone="danger" id={`${uid}-e`} className="mt-2">{error}</Alert>}
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
