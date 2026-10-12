"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContentFormat } from "@prisma/client";
import { Send, TriangleAlert } from "lucide-react";
import { submitPost, updatePost } from "@/app/(app)/content/actions";
import type { PostPatch } from "@/lib/content/posts";
import type { PostPanelView } from "@/lib/content/panelView";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FieldError, fieldClass, labelClass } from "@/components/ui/Field";
import { MediaStrip } from "./MediaStrip";
import { shortDay } from "./PostTile";

export const FORMAT_LABEL: Record<ContentFormat, string> = { SINGLE: "Single image", CAROUSEL: "Carousel", VIDEO: "Video" };

export const AUTOSAVE_MS = 800;

type Fields = { format: ContentFormat; plannedAt: string; typeId: string; brief: string; caption: string };
type Key = keyof Fields;

/** Only the changed fields, with empty date and type sent as null. */
function patchOf(saved: Fields, now: Fields): PostPatch {
  const p: PostPatch = {};
  for (const k of Object.keys(now) as Key[]) {
    if (now[k] === saved[k]) continue;
    if (k === "plannedAt" || k === "typeId") p[k] = now[k] || null;
    else if (k === "format") p.format = now.format;
    else p[k] = now[k];
  }
  return p;
}

/** Drafting view: every field editable, autosaved after a pause, and "Submit for approval" for planned posts. */
export function PostPanelEditor({ view }: { view: PostPanelView }) {
  const { post, can } = view;
  const router = useRouter();
  const uid = useId();
  const initial: Fields = { format: post.format, plannedAt: post.plannedAt ?? "", typeId: post.typeId ?? "", brief: post.brief, caption: post.caption };
  const [fields, setFields] = useState(initial);
  const latest = useRef(initial);
  const saved = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [save, setSave] = useState<"idle" | "saving" | "saved">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function failed(r: { code: string; message: string; fieldErrors?: Record<string, string> }) {
    const fe = r.fieldErrors ?? {};
    setErrors(fe);
    setMessage(Object.keys(fe).length ? null : r.message);
    if (r.code === "LOCKED" || r.code === "CONFLICT") router.refresh();
  }

  /** Sends whatever changed since the last save; false when the save failed. */
  async function flush(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = patchOf(saved.current, latest.current);
    if (!Object.keys(patch).length) return true;
    const sent = latest.current;
    setSave("saving");
    try {
      const r = await updatePost(post.id, patch);
      if (!r.ok) {
        setSave("idle");
        failed(r);
        return false;
      }
      saved.current = { ...saved.current, ...Object.fromEntries(Object.keys(patch).map((k) => [k, sent[k as Key]])) };
      setSave("saved");
      setMessage(null);
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))));
      return true;
    } catch {
      setSave("idle");
      setMessage("Something went wrong. Try again.");
      return false;
    }
  }
  const flushRef = useRef(flush);
  useEffect(() => { flushRef.current = flush; });
  // Leaving the panel (another post, close) still saves a pending edit.
  useEffect(() => () => { if (timer.current) void flushRef.current(); }, []);

  function change<K extends Key>(k: K, v: Fields[K], now = false) {
    latest.current = { ...latest.current, [k]: v };
    setFields(latest.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), now ? 0 : AUTOSAVE_MS);
  }

  async function submit() {
    setSubmitting(true);
    try {
      if (!(await flush())) return;
      const r = await submitPost(post.id);
      if (!r.ok) failed(r);
    } catch {
      setMessage("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const id = (k: string) => `${uid}-${k}`;
  const props = (k: Key, kind: "input" | "select" | "textarea" = "input") => ({
    id: id(k),
    className: fieldClass({ kind, invalid: !!errors[k] }),
    "aria-invalid": errors[k] ? (true as const) : undefined,
    "aria-describedby": errors[k] ? id(`${k}-err`) : undefined,
  });
  const published = post.kind === "PUBLISHED";

  return (
    <div className="flex flex-col gap-4">
      <MediaStrip postId={post.id} role="MOCKUP" items={view.mockups} editable mediaReady={view.mediaReady} label="Media (mock-up / reference)" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={id("format")} className={labelClass}>Format</label>
          <select {...props("format", "select")} value={fields.format} onChange={(e) => change("format", e.target.value as ContentFormat, true)}>
            {(Object.keys(FORMAT_LABEL) as ContentFormat[]).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
          </select>
        </div>
        {!published ? (
          <div>
            <label htmlFor={id("plannedAt")} className={labelClass}>Post date</label>
            <input {...props("plannedAt")} type="date" value={fields.plannedAt} onChange={(e) => change("plannedAt", e.target.value)} />
            <FieldError id={id("plannedAt-err")}>{errors.plannedAt}</FieldError>
          </div>
        ) : null}
      </div>
      {view.warnDate ? (
        <div data-tone="due-soon" className="flex flex-wrap items-center gap-2 rounded-lg bg-tone-tint px-3 py-2 text-[13px] text-tone-text [&_svg]:size-4">
          <TriangleAlert aria-hidden="true" />
          <span className="flex-1">This date is out of order with the posts above it.</span>
          <Button size="sm" variant="secondary" onClick={() => change("plannedAt", view.warnDate!, true)}>{`Set to ${shortDay(view.warnDate)}`}</Button>
        </div>
      ) : null}
      {!published ? (
        <div>
          <label htmlFor={id("typeId")} className={labelClass}>Request type</label>
          <select {...props("typeId", "select")} value={fields.typeId} onChange={(e) => change("typeId", e.target.value, true)}>
            <option value="">No preference</option>
            {view.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      ) : null}
      <div>
        <label htmlFor={id("brief")} className={labelClass}>Brief</label>
        <textarea {...props("brief", "textarea")} rows={4} value={fields.brief} onChange={(e) => change("brief", e.target.value)}
          placeholder="What should the designer make? Slides, key message, references" />
        <FieldError id={id("brief-err")}>{errors.brief}</FieldError>
      </div>
      <div>
        <label htmlFor={id("caption")} className={labelClass}>Caption draft</label>
        <textarea {...props("caption", "textarea")} rows={3} value={fields.caption} onChange={(e) => change("caption", e.target.value)} />
        <FieldError id={id("caption-err")}>{errors.caption}</FieldError>
      </div>
      {message ? <Alert tone="danger">{message}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <p role="status" className="text-xs text-foreground-secondary">{save === "saving" ? "Saving…" : save === "saved" ? "Saved" : ""}</p>
        {can.submit ? (
          <Button variant="primary" className="ml-auto" icon={<Send />} loading={submitting} onClick={submit}>Submit for approval</Button>
        ) : null}
      </div>
    </div>
  );
}
