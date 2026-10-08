"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitRequest } from "../actions";
import type { SubmitState } from "@/lib/submitRequest";
import { errorSummary } from "@/lib/formErrors";

type Opt = { id: string; name: string };

const control =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[invalid=true]:border-2";

function Field({ id, label, error, required, children }: { id: string; label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-foreground underline decoration-wavy">
          {error}
        </p>
      )}
    </div>
  );
}

export function NewRequestForm({ brands, divisions }: { brands: Opt[]; divisions: Opt[] }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitRequest, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errs = (state && !state.ok && state.fieldErrors) || {};
  const v = state?.values;
  const props = (k: string) => ({
    id: k,
    name: k,
    className: control,
    "aria-invalid": errs[k] ? (true as const) : undefined,
    "aria-describedby": errs[k] ? `${k}-error` : undefined,
  });
  // Errors with no rendered field (e.g. "form", unknown detail keys) go in the banner.
  const rendered = new Set(["title", "briefUrl", "notes", "brandId", "divisionId", "deadline"]);
  const orphan = Object.entries(errs).filter(([k]) => !rendered.has(k)).map(([, m]) => m);
  const hasFieldErrors = Object.keys(errs).length > 0;
  const generic = state && !state.ok ? (hasFieldErrors ? orphan.join(" ") : state.message) : "";
  const LABELS: Record<string, string> = { title: "Title", briefUrl: "Brief link", notes: "Notes", brandId: "Brand", divisionId: "Division", deadline: "Deadline" };
  const summary = errorSummary(Object.fromEntries(Object.entries(errs).filter(([k]) => rendered.has(k))), (k) => LABELS[k] ?? "");

  // React 19 resets uncontrolled fields after the action; the key remounts them with defaults from the echoed values.
  const nonce = state?.nonce ?? "initial";
  useEffect(() => {
    if (state?.nonce) {
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
    }
  }, [state?.nonce]);

  return (
    <>
    {/* Outside the keyed form so the live region persists across submits and the new text is announced. */}
    <p role="status" aria-live="polite" className="sr-only">{summary}</p>
    <form ref={formRef} key={nonce} action={action} className="space-y-5" noValidate>
      {generic && (
        <p role="alert" className="rounded-md border border-border bg-muted p-3 text-sm">
          {generic}
        </p>
      )}
      <Field id="title" label="Title" required error={errs.title}>
        <input {...props("title")} type="text" required maxLength={200} defaultValue={v?.title} />
      </Field>
      <Field id="briefUrl" label="Brief link" error={errs.briefUrl}>
        <input {...props("briefUrl")} type="url" placeholder="https://" defaultValue={v?.briefUrl} />
      </Field>
      <Field id="notes" label="Notes" error={errs.notes}>
        <textarea {...props("notes")} rows={4} defaultValue={v?.notes} />
      </Field>
      <Field id="brandId" label="Brand" required error={errs.brandId}>
        <select {...props("brandId")} defaultValue={v?.brandId ?? ""} required>
          <option value="" disabled>Select a brand</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field id="divisionId" label="Division" required error={errs.divisionId}>
        <select {...props("divisionId")} defaultValue={v?.divisionId ?? ""} required>
          <option value="" disabled>Select a division</option>
          {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </Field>
      <Field id="deadline" label="Deadline" error={errs.deadline}>
        <input {...props("deadline")} type="date" defaultValue={v?.deadline} />
      </Field>

      <fieldset className="space-y-2" aria-describedby="needsMotion-help">
        <legend className="text-sm font-medium">Does this task need motion?</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="needsMotion" value="no" defaultChecked={!v?.needsMotion} className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-ring" />
            No
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="needsMotion" value="yes" defaultChecked={!!v?.needsMotion} className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-ring" />
            Yes, needs motion
          </label>
        </div>
        <p id="needsMotion-help" className="text-sm text-muted-foreground">
          Motion work is done by the motion/video editor. Marking it lets us count both the design effort and the motion effort later.
        </p>
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit request"}
      </button>
    </form>
    </>
  );
}
