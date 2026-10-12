"use client";

import { useId, useState, type FormEvent } from "react";
import { CheckCheck, Undo2 } from "lucide-react";
import { sendBackPost } from "@/app/(app)/content/actions";
import type { PostPanelView } from "@/lib/content/panelView";
import { Button } from "@/components/ui/Button";
import { FieldError, fieldClass, labelClass } from "@/components/ui/Field";
import { MediaStrip } from "./MediaStrip";
import { FORMAT_LABEL } from "./PostPanelEditor";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "2026-10-24" → "24 Oct 2026". */
const longDay = (ymd: string) => DATE_FMT.format(new Date(`${ymd}T00:00:00Z`));

function ReadOnly({ id, label, value, multiline = false }: { id: string; label: string; value: string; multiline?: boolean }) {
  const cls = fieldClass({ kind: multiline ? "textarea" : "input", className: "bg-surface-muted" });
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      {multiline
        ? <textarea id={id} readOnly value={value} rows={Math.min(8, Math.max(2, value.split("\n").length))} className={cls} />
        : <input id={id} readOnly value={value} className={cls} />}
    </div>
  );
}

/** "Send back…": a required feedback note for the author. */
function SendBack({ postId, onCancel }: { postId: string; onCancel: () => void }) {
  const uid = useId();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await sendBackPost(postId, note);
      if (!r.ok) setError(r.fieldErrors?.note ?? r.message);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <label htmlFor={`${uid}-note`} className={labelClass}>Feedback note</label>
      <textarea id={`${uid}-note`} value={note} onChange={(e) => setNote(e.target.value)} rows={3} autoFocus
        placeholder="What should the author change?" aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-err` : undefined}
        className={fieldClass({ kind: "textarea", invalid: !!error })} />
      <FieldError id={`${uid}-err`}>{error}</FieldError>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" type="submit" variant="primary" disabled={!note.trim()} loading={pending}>Send back</Button>
      </div>
    </form>
  );
}

/** Locked view: every field read-only; leads review a submitted post, and final files are added in production. */
export function PostPanelReview({ view, onApprove, approving }: { view: PostPanelView; onApprove: () => void; approving: boolean }) {
  const { post, can } = view;
  const uid = useId();
  const [sendingBack, setSendingBack] = useState(false);
  const type = view.types.find((t) => t.id === post.typeId)?.name ?? "No preference";
  const inProduction = post.status === "IN_PRODUCTION" || post.status === "DONE";
  return (
    <div className="flex flex-col gap-4">
      <MediaStrip postId={post.id} role="MOCKUP" items={view.mockups} editable={false} mediaReady={view.mediaReady} label="Mock-ups" />
      {inProduction ? (
        <MediaStrip postId={post.id} role="FINAL" items={view.finals} editable={can.addFinal} mediaReady={view.mediaReady} label="Final files" />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <ReadOnly id={`${uid}-format`} label="Format" value={FORMAT_LABEL[post.format]} />
        {post.kind === "PUBLISHED"
          ? <ReadOnly id={`${uid}-date`} label="Posted on" value={post.publishedAt ? longDay(post.publishedAt) : "—"} />
          : <ReadOnly id={`${uid}-date`} label="Post date" value={post.plannedAt ? longDay(post.plannedAt) : "Not set"} />}
      </div>
      {post.kind === "PLANNED" ? <ReadOnly id={`${uid}-type`} label="Request type" value={type} /> : null}
      <ReadOnly id={`${uid}-brief`} label="Brief" value={post.brief} multiline />
      <ReadOnly id={`${uid}-caption`} label="Caption draft" value={post.caption} multiline />
      {can.approve ? (
        sendingBack ? <SendBack postId={post.id} onCancel={() => setSendingBack(false)} /> : (
          <div className="flex flex-wrap justify-end gap-2">
            <Button icon={<Undo2 />} onClick={() => setSendingBack(true)}>Send back…</Button>
            <Button variant="primary" icon={<CheckCheck />} loading={approving} onClick={onApprove}>Approve…</Button>
          </div>
        )
      ) : null}
    </div>
  );
}
