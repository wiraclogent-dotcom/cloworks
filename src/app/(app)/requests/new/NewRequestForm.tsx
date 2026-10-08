"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitRequest } from "../actions";
import type { SubmitState } from "@/lib/submitRequest";
import type { FieldSchema } from "@/lib/fieldSchema";

type Opt = { id: string; name: string };
type TypeOpt = Opt & { fieldSchema: FieldSchema };

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

export function NewRequestForm({ brands, divisions, types }: { brands: Opt[]; divisions: Opt[]; types: TypeOpt[] }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitRequest, null);
  const [chosenType, setTypeId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const errs = (state && !state.ok && state.fieldErrors) || {};
  const v = state?.values;
  const typeId = chosenType ?? v?.typeId ?? "";
  const schema = types.find((t) => t.id === typeId)?.fieldSchema ?? [];
  const props = (k: string) => ({
    id: k,
    name: k,
    className: control,
    "aria-invalid": errs[k] ? (true as const) : undefined,
    "aria-describedby": errs[k] ? `${k}-error` : undefined,
  });
  // Errors with no rendered field (e.g. "form", unknown detail keys) go in the banner.
  const rendered = new Set(["title", "briefUrl", "notes", "brandId", "divisionId", "typeId", "deadline", ...schema.map((f) => `fields.${f.key}`)]);
  const orphan = Object.entries(errs).filter(([k]) => !rendered.has(k)).map(([, m]) => m);
  const generic = state && !state.ok ? (Object.keys(errs).length ? orphan.join(" ") : state.message) : "";

  // React 19 resets uncontrolled fields after the action; the key remounts them with defaults from the echoed values.
  const nonce = state?.nonce ?? "initial";
  useEffect(() => {
    if (state?.nonce) {
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
    }
  }, [state?.nonce]);

  return (
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
      <Field id="typeId" label="Request type" required error={errs.typeId}>
        <select {...props("typeId")} value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
          <option value="" disabled>Select a type</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </Field>
      <Field id="deadline" label="Deadline" error={errs.deadline}>
        <input {...props("deadline")} type="date" defaultValue={v?.deadline} />
      </Field>

      {schema.length > 0 && (
        <fieldset className="space-y-5 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-medium">Details</legend>
          {schema.map((f) => {
            const id = `f_${f.key}`;
            const err = errs[`fields.${f.key}`];
            const p = { ...props(id), "aria-invalid": err ? (true as const) : undefined, "aria-describedby": err ? `${id}-error` : undefined };
            if (f.type === "checkbox")
              return (
                <div key={f.key} className="space-y-1">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input id={id} name={id} type="checkbox" defaultChecked={v?.fields[f.key] === true} className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-ring" aria-describedby={p["aria-describedby"]} />
                    {f.label}
                  </label>
                  {err && <p id={`${id}-error`} className="text-sm font-medium underline decoration-wavy">{err}</p>}
                </div>
              );
            return (
              <Field key={f.key} id={id} label={f.label} required={f.required} error={err}>
                {f.type === "select" ? (
                  <select {...p} defaultValue={typeof v?.fields[f.key] === "string" ? (v.fields[f.key] as string) : ""}>
                    <option value="" disabled>Select…</option>
                    {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input {...p} type={f.type === "url" ? "url" : "text"} defaultValue={typeof v?.fields[f.key] === "string" ? (v.fields[f.key] as string) : undefined} />
                )}
              </Field>
            );
          })}
        </fieldset>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit request"}
      </button>
    </form>
  );
}
