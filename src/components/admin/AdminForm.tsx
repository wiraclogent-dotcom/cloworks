"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { AdminFormState } from "@/lib/adminForm";

export const control =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[invalid=true]:border-2";
export const primaryBtn =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60";
export const ghostBtn =
  "rounded-md border border-border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60";

export type FormCtx = {
  /** Echoed value after a failed submit, else the server-provided default. */
  v: (name: string, fallback?: string) => string;
  /** aria props for a field, wired to the shared message. */
  aria: (name?: string) => { "aria-invalid"?: true; "aria-describedby"?: string };
  idFor: (name: string) => string;
  /** True when the last submit failed (unchecked checkboxes are then absent from the echo on purpose). */
  failed: boolean;
};

/**
 * Wraps a server action: keeps typed input after an error (the nonce remounts uncontrolled fields with the echoed values),
 * and reports the outcome as text ("Error: ..." / the success message), never by colour alone.
 */
export function AdminForm({
  action,
  prefix,
  submitLabel,
  children,
  className,
  hidden,
}: {
  action: (prev: AdminFormState, fd: FormData) => Promise<AdminFormState>;
  prefix: string;
  submitLabel: string;
  children: (ctx: FormCtx) => React.ReactNode;
  className?: string;
  hidden?: Record<string, string>;
}) {
  const [state, run, pending] = useActionState<AdminFormState, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  const failed = !!state && !state.ok;
  const msgId = `${prefix}-msg`;
  const echoed = failed ? state.values : undefined;
  const ctx: FormCtx = {
    v: (name, fallback = "") => echoed?.[name] ?? fallback,
    aria: () => (failed ? { "aria-invalid": true, "aria-describedby": msgId } : {}),
    idFor: (name) => `${prefix}-${name}`,
    failed,
  };
  useEffect(() => {
    if (state && !state.ok) ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  return (
    <form ref={ref} key={state?.nonce ?? "initial"} action={run} className={className ?? "space-y-3"} noValidate>
      {Object.entries(hidden ?? {}).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}
      {children(ctx)}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Saving…" : submitLabel}</button>
        {state && (
          <div id={msgId} role={failed ? "alert" : "status"} className="text-sm">
            <p className="font-medium">{failed ? `Error: ${state.message}` : state.message}</p>
            {failed && state.details && state.details.length > 1 && (
              <ul className="list-disc pl-5">{state.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
            )}
          </div>
        )}
      </div>
    </form>
  );
}

export function Labeled({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

/**
 * Two-step destructive action: the first button only reveals a confirmation; nothing is submitted until the
 * explicit confirm button is pressed.
 */
export function ConfirmAction({
  action,
  prefix,
  hidden,
  triggerLabel,
  question,
  confirmLabel,
}: {
  action: (prev: AdminFormState, fd: FormData) => Promise<AdminFormState>;
  prefix: string;
  hidden: Record<string, string>;
  triggerLabel: string;
  question: string;
  confirmLabel: string;
}) {
  const [state, run, pending] = useActionState<AdminFormState, FormData>(action, null);
  const [asking, setAsking] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);
  useEffect(() => {
    if (state) setAsking(false);
  }, [state]);
  const failed = !!state && !state.ok;
  return (
    <form action={run} className="space-y-2">
      {Object.entries(hidden).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}
      {asking ? (
        <div role="group" aria-label={`Confirm: ${triggerLabel}`} className="space-y-2 rounded-md border border-border p-2">
          <p className="text-sm font-medium">{question}</p>
          <div className="flex gap-2">
            <button ref={confirmRef} type="submit" disabled={pending} className={primaryBtn}>{pending ? "Working…" : confirmLabel}</button>
            <button type="button" className={ghostBtn} onClick={() => { setAsking(false); setTimeout(() => triggerRef.current?.focus(), 0); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button ref={triggerRef} type="button" className={ghostBtn} onClick={() => setAsking(true)} aria-expanded={false}>{triggerLabel}</button>
      )}
      {state && (
        <p id={`${prefix}-msg`} role={failed ? "alert" : "status"} className="text-sm font-medium">
          {failed ? `Error: ${state.message}` : state.message}
        </p>
      )}
    </form>
  );
}
