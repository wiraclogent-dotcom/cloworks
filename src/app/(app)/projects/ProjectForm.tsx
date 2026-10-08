"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitProject } from "./actions";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectFormState, type ProjectFormValues } from "@/lib/projects";

type Opt = { id: string; name: string };

const control =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[invalid=true]:border-2";

function Field({ id, label, error, required, children }: { id: string; label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">{label}{required && <span aria-hidden="true"> *</span>}</label>
      {children}
      {error && <p id={`${id}-error`} className="text-sm font-medium text-foreground underline decoration-wavy">{error}</p>}
    </div>
  );
}

/** Create (no `projectId`) or edit form. `initial` pre-fills an edit. Typed input survives a failed submit. */
export function ProjectForm({ brands, owners, initial, projectId }: { brands: Opt[]; owners: Opt[]; initial?: ProjectFormValues; projectId?: string }) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(submitProject.bind(null, projectId ?? null), null);
  const formRef = useRef<HTMLFormElement>(null);
  const errs = (state && state.fieldErrors) || {};
  const v = state?.values ?? initial;
  const props = (k: string) => ({
    id: k, name: k, className: control,
    "aria-invalid": errs[k] ? (true as const) : undefined,
    "aria-describedby": errs[k] ? `${k}-error` : undefined,
  });
  const rendered = new Set(["title", "subTitle", "brandId", "ownerId", "status", "startDate", "dueDate", "fileUrl"]);
  const orphan = Object.entries(errs).filter(([k]) => !rendered.has(k)).map(([, m]) => m);
  const generic = state ? (Object.keys(errs).length ? orphan.join(" ") : state.message) : "";
  const nonce = state?.nonce ?? "initial";

  useEffect(() => {
    if (state?.nonce) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state?.nonce]);

  return (
    <form ref={formRef} key={nonce} action={action} className="space-y-5" noValidate>
      {generic && <p role="alert" className="rounded-md border border-border bg-muted p-3 text-sm">{generic}</p>}
      <Field id="title" label="Title" required error={errs.title}>
        <input {...props("title")} type="text" required maxLength={200} defaultValue={v?.title} />
      </Field>
      <Field id="subTitle" label="Sub title" error={errs.subTitle}>
        <input {...props("subTitle")} type="text" maxLength={200} defaultValue={v?.subTitle} />
      </Field>
      <Field id="brandId" label="Brand" error={errs.brandId}>
        <select {...props("brandId")} defaultValue={v?.brandId ?? ""}>
          <option value="">No brand</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field id="ownerId" label="Owner" required error={errs.ownerId}>
        <select {...props("ownerId")} defaultValue={v?.ownerId ?? ""} required>
          <option value="" disabled>Select an owner</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </Field>
      <Field id="status" label="Status" required error={errs.status}>
        <select {...props("status")} defaultValue={v?.status || "NOT_STARTED"} required>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
        </select>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="startDate" label="Start date" error={errs.startDate}>
          <input {...props("startDate")} type="date" defaultValue={v?.startDate} />
        </Field>
        <Field id="dueDate" label="Due date" error={errs.dueDate}>
          <input {...props("dueDate")} type="date" defaultValue={v?.dueDate} />
        </Field>
      </div>
      <Field id="fileUrl" label="File link" error={errs.fileUrl}>
        <input {...props("fileUrl")} type="url" placeholder="https://" maxLength={2048} defaultValue={v?.fileUrl} />
      </Field>
      <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60">
        {pending ? "Saving…" : projectId ? "Save changes" : "Create project"}
      </button>
    </form>
  );
}
