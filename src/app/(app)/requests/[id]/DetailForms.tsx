"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RequestStatus } from "@prisma/client";
import { addAttachment, addComment, assignRequest, removeAttachment } from "./actions";
import { moveRequest } from "../actions";
import { DoneDialog } from "@/components/DoneDialog";
import { MOVE_TARGETS, STATUS_LABEL } from "@/components/status";
import { canTransition } from "@/lib/workflow";

const control = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const button = "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60";

function ErrorLine({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return <p id={id} role="alert" className="text-sm font-medium"><span aria-hidden="true">⚠ </span>{message}</p>;
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
    <form onSubmit={submit} className="space-y-2" noValidate>
      <label htmlFor={`${uid}-b`} className="block text-sm font-medium">Add a comment</label>
      <textarea id={`${uid}-b`} value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={5000}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-e` : `${uid}-h`} className={control} />
      <p id={`${uid}-h`} className="text-xs text-muted-foreground">Type @ and a name to mention a teammate.</p>
      <ErrorLine id={`${uid}-e`} message={error} />
      <button type="submit" disabled={pending} className={button}>{pending ? "Posting…" : "Post comment"}</button>
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
    <form onSubmit={submit} className="space-y-2" noValidate>
      <div>
        <label htmlFor={`${uid}-n`} className="block text-sm font-medium">Link name</label>
        <input id={`${uid}-n`} value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={control} />
      </div>
      <div>
        <label htmlFor={`${uid}-u`} className="block text-sm font-medium">Link address</label>
        <input id={`${uid}-u`} type="url" maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className={control} aria-describedby={error ? `${uid}-e` : undefined} />
      </div>
      <ErrorLine id={`${uid}-e`} message={error} />
      <button type="submit" disabled={pending} className={button}>{pending ? "Adding…" : "Add link"}</button>
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
        className="text-sm underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60">Remove</button>
      {error && <span role="alert" className="ml-2 text-sm">{error}</span>}
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
    <div className="space-y-1">
      <label htmlFor={`${uid}-a`} className="block text-sm font-medium">Assignee</label>
      <select id={`${uid}-a`} value={value} disabled={pending} onChange={(e) => change(e.target.value)} className={control}>
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
    <div className="space-y-1">
      <label htmlFor={`${uid}-m`} className="block text-sm font-medium">Move to…</label>
      <select id={`${uid}-m`} value="" disabled={pending}
        onChange={(e) => { const to = e.target.value as RequestStatus; if (!to) return; if (to === "DONE") setPendingDone(true); else move(to); }}
        className={control}>
        <option value="">Choose a status</option>
        {legal.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
      <ErrorLine id={`${uid}-e`} message={error} />
      {pendingDone && <DoneDialog title={title} onCancel={() => setPendingDone(false)} onSubmit={(d) => { setPendingDone(false); move("DONE", d); }} />}
    </div>
  );
}
