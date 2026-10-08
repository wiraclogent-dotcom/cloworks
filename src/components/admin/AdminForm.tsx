"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { AdminFormState } from "@/lib/adminForm";
import { Alert } from "@/components/ui/Alert";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { fieldClass, labelClass } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";

/** Kit field styles for admin forms; a failed submit (aria-invalid) turns the outline red as well as the message. */
const invalidOutline = "aria-[invalid=true]:border-danger";
export const control = fieldClass({ className: invalidOutline });
export const selectControl = fieldClass({ kind: "select", className: invalidOutline });
export const textareaControl = fieldClass({ kind: "textarea", className: invalidOutline });

export type FormCtx = {
  /** Echoed value after a failed submit, else the server-provided default. */
  v: (name: string, fallback?: string) => string;
  /** aria props for a field, wired to the shared message. */
  aria: (name?: string) => { "aria-invalid"?: true; "aria-describedby"?: string };
  idFor: (name: string) => string;
  /** True when the last submit failed (unchecked checkboxes are then absent from the echo on purpose). */
  failed: boolean;
};

/** The outcome of a submit as an Alert: "Error: …" (+ every detail) or the success message; text, never colour alone. */
function Outcome({ id, state }: { id: string; state: NonNullable<AdminFormState> }) {
  const failed = !state.ok;
  return (
    <Alert id={id} tone={failed ? "danger" : "success"} role={failed ? "alert" : "status"} className="w-full">
      <p className="font-medium">{failed ? `Error: ${state.message}` : state.message}</p>
      {failed && state.details && state.details.length > 1 && (
        <ul className="mt-1 list-disc pl-5">{state.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
      )}
    </Alert>
  );
}

/**
 * Wraps a server action: keeps typed input after an error (the nonce remounts uncontrolled fields with the echoed values),
 * and reports the outcome as text ("Error: ..." / the success message), never by colour alone.
 */
export function AdminForm({
  action,
  prefix,
  submitLabel,
  submitAriaLabel,
  submitVariant = "primary",
  children,
  className,
  hidden,
}: {
  action: (prev: AdminFormState, fd: FormData) => Promise<AdminFormState>;
  prefix: string;
  submitLabel: string;
  /** Unique accessible name when the visible label repeats per row (e.g. "Save changes for Rina"). */
  submitAriaLabel?: string;
  submitVariant?: ButtonVariant;
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
        <Button type="submit" variant={submitVariant} loading={pending} aria-label={submitAriaLabel}>{pending ? "Saving…" : submitLabel}</Button>
      </div>
      {state && <Outcome id={msgId} state={state} />}
    </form>
  );
}

export function Labeled({ id, label, children, className }: { id: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      {children}
    </div>
  );
}

/**
 * Two-step destructive action: the first button only reveals a confirmation; nothing is submitted until the
 * explicit confirm button (kit danger button) is pressed.
 */
export function ConfirmAction({
  action,
  prefix,
  hidden,
  triggerLabel,
  triggerAriaLabel,
  question,
  confirmLabel,
}: {
  action: (prev: AdminFormState, fd: FormData) => Promise<AdminFormState>;
  prefix: string;
  hidden: Record<string, string>;
  triggerLabel: string;
  /** Unique accessible name for the trigger when the visible label repeats per row. */
  triggerAriaLabel?: string;
  question: string;
  confirmLabel: string;
}) {
  const [state, run, pending] = useActionState<AdminFormState, FormData>(action, null);
  // The question is open only for the action state it was opened against, so any new result closes it (no effect needed).
  const [askedAt, setAskedAt] = useState<{ state: AdminFormState } | null>(null);
  const asking = askedAt !== null && askedAt.state === state;
  const setAsking = (open: boolean) => setAskedAt(open ? { state } : null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (asking) confirmRef.current?.focus();
  }, [asking]);
  const failed = !!state && !state.ok;
  return (
    <form action={run} className="space-y-2">
      {Object.entries(hidden).map(([k, val]) => <input key={k} type="hidden" name={k} value={val} />)}
      {asking ? (
        <div role="group" aria-label={`Confirm: ${triggerLabel}`} data-tone="cancelled" className="space-y-2.5 rounded-lg border border-tone-accent/40 bg-tone-tint p-3">
          <p className="text-sm font-medium text-tone-text">{question}</p>
          <div className="flex flex-wrap gap-2">
            <Button ref={confirmRef} type="submit" variant="danger" size="sm" loading={pending}>{pending ? "Working…" : confirmLabel}</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setAsking(false); setTimeout(() => triggerRef.current?.focus(), 0); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button ref={triggerRef} type="button" variant="ghost" size="sm" aria-label={triggerAriaLabel} onClick={() => setAsking(true)}
          className={cn("text-danger hover:text-danger")}>
          {triggerLabel}
        </Button>
      )}
      {state && (
        <p id={`${prefix}-msg`} role={failed ? "alert" : "status"} className={cn("text-[13px] font-medium", failed ? "text-danger" : "text-foreground-secondary")}>
          {failed ? `Error: ${state.message}` : state.message}
        </p>
      )}
    </form>
  );
}
