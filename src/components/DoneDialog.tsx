"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "./ui/Button";
import { FieldError, fieldClass, labelClass } from "./ui/Field";

/** Mirrors MAX_OUTPUT_COUNT in src/lib/transition.ts (kept local: that module is server-side). */
const MAX_OUTPUTS = 1000;

export type DoneDetails = { outputCount: number; designFolderUrl?: string };

const FOCUSABLE = 'input, button, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Modal asking for the delivery details when a request is marked Done. Traps focus, closes on Escape, restores focus on close. */
export function DoneDialog({ title, onCancel, onSubmit }: { title: string; onCancel: () => void; onSubmit: (d: DoneDetails) => void }) {
  const uid = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState("1");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<{ count?: string; url?: string }>({});

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input")?.focus();
    return () => previous?.focus?.();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      // preventDefault too: inside the request side panel (a native <dialog>) Escape would otherwise also fire the
      // panel's cancel event and close it along with this dialog.
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => !el.hasAttribute("disabled"));
    if (items.length === 0) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: { count?: string; url?: string } = {};
    const n = Number(count);
    if (!/^\d{1,4}$/.test(count.trim()) || n < 1 || n > MAX_OUTPUTS) errs.count = `Enter a whole number from 1 to ${MAX_OUTPUTS}.`;
    const u = url.trim();
    if (u && !isHttpUrl(u)) errs.url = "Enter a full http(s) link, for example https://drive.google.com/…";
    setErrors(errs);
    if (errs.count || errs.url) return;
    onSubmit({ outputCount: n, ...(u ? { designFolderUrl: u } : {}) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--backdrop)] p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} aria-describedby={`${uid}-d`} onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-raised">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" data-tone="done" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tone-tint text-tone-text">
            <CircleCheck strokeWidth={1.75} className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id={`${uid}-t`} className="text-base font-semibold text-foreground">Mark as done</h2>
            <p id={`${uid}-d`} className="mt-0.5 text-sm break-words text-foreground-secondary">“{title}” is finished. Tell us what was delivered.</p>
          </div>
        </div>
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <div>
            <label htmlFor={`${uid}-n`} className={labelClass}>Number of outputs <span aria-hidden="true">*</span></label>
            <input id={`${uid}-n`} inputMode="numeric" pattern="[0-9]*" maxLength={4} value={count} onChange={(e) => setCount(e.target.value)}
              aria-invalid={!!errors.count} aria-describedby={errors.count ? `${uid}-ne` : undefined} className={fieldClass({ invalid: !!errors.count, className: "tabular-nums" })} />
            <FieldError id={`${uid}-ne`}>{errors.count}</FieldError>
          </div>
          <div>
            <label htmlFor={`${uid}-u`} className={labelClass}>Design folder link (optional)</label>
            <input id={`${uid}-u`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://"
              aria-invalid={!!errors.url} aria-describedby={errors.url ? `${uid}-ue` : undefined} className={fieldClass({ invalid: !!errors.url })} />
            <FieldError id={`${uid}-ue`}>{errors.url}</FieldError>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" variant="primary">Mark as done</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
