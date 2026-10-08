"use client";

import { useEffect, useId, useRef, useState } from "react";

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

  const input = "mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${uid}-t`} onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-lg">
        <h2 id={`${uid}-t`} className="text-lg font-semibold">Mark as done</h2>
        <p className="mt-1 text-sm text-muted-foreground">“{title}” is finished. Tell us what was delivered.</p>
        <form onSubmit={submit} noValidate className="mt-4 space-y-4">
          <div>
            <label htmlFor={`${uid}-n`} className="text-sm font-medium">Number of outputs *</label>
            <input id={`${uid}-n`} inputMode="numeric" pattern="[0-9]*" maxLength={4} value={count} onChange={(e) => setCount(e.target.value)}
              aria-invalid={!!errors.count} aria-describedby={errors.count ? `${uid}-ne` : undefined} className={input} />
            {errors.count && <p id={`${uid}-ne`} className="mt-1 text-sm">{errors.count}</p>}
          </div>
          <div>
            <label htmlFor={`${uid}-u`} className="text-sm font-medium">Design folder link (optional)</label>
            <input id={`${uid}-u`} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://"
              aria-invalid={!!errors.url} aria-describedby={errors.url ? `${uid}-ue` : undefined} className={input} />
            {errors.url && <p id={`${uid}-ue`} className="mt-1 text-sm">{errors.url}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-md border border-border px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring">Cancel</button>
            <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Mark as done</button>
          </div>
        </form>
      </div>
    </div>
  );
}
