"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitProject } from "./actions";
import { errorSummary } from "@/lib/formErrors";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectFormState, type ProjectFormValues } from "@/lib/projects";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { FieldError, fieldClass, labelClass } from "@/components/ui/Field";

type Opt = { id: string; name: string };

function Field({ id, label, error, required, children }: { id: string; label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}{required && <span aria-hidden="true" className="text-danger"> *</span>}</label>
      {children}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

/** Create (no `projectId`) or edit form. `initial` pre-fills an edit. Typed input survives a failed submit. */
export function ProjectForm({ brands, owners, initial, projectId }: { brands: Opt[]; owners: Opt[]; initial?: ProjectFormValues; projectId?: string }) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(submitProject.bind(null, projectId ?? null), null);
  const formRef = useRef<HTMLFormElement>(null);
  const errs = (state && state.fieldErrors) || {};
  const v = state?.values ?? initial;
  const props = (k: string, kind: "input" | "select" = "input") => ({
    id: k, name: k, className: fieldClass({ kind, invalid: !!errs[k] }),
    "aria-invalid": errs[k] ? (true as const) : undefined,
    "aria-describedby": errs[k] ? `${k}-error` : undefined,
  });
  const rendered = new Set(["title", "subTitle", "brandId", "ownerId", "status", "startDate", "dueDate", "fileUrl"]);
  const orphan = Object.entries(errs).filter(([k]) => !rendered.has(k)).map(([, m]) => m);
  const hasFieldErrors = Object.keys(errs).length > 0;
  const generic = state ? (hasFieldErrors ? orphan.join(" ") : state.message) : "";
  const LABELS: Record<string, string> = { title: "Title", subTitle: "Sub title", brandId: "Brand", ownerId: "Owner", status: "Status", startDate: "Start date", dueDate: "Due date", fileUrl: "File link" };
  const summary = errorSummary(Object.fromEntries(Object.entries(errs).filter(([k]) => rendered.has(k))), (k) => LABELS[k] ?? "");
  const nonce = state?.nonce ?? "initial";

  useEffect(() => {
    if (state?.nonce) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state?.nonce]);

  return (
    <>
    {/* Outside the keyed form so the live region persists across submits and the new text is announced. */}
    <p role="status" aria-live="polite" className="sr-only">{summary}</p>
    <form ref={formRef} key={nonce} action={action} className="space-y-4" noValidate>
      {generic && <Alert tone="danger">{generic}</Alert>}
      <Card className="space-y-4">
      <CardTitle>Project</CardTitle>
      <Field id="title" label="Title" required error={errs.title}>
        <input {...props("title")} type="text" required maxLength={200} defaultValue={v?.title} />
      </Field>
      <Field id="subTitle" label="Sub title" error={errs.subTitle}>
        <input {...props("subTitle")} type="text" maxLength={200} defaultValue={v?.subTitle} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
      <Field id="brandId" label="Brand" error={errs.brandId}>
        <select {...props("brandId", "select")} defaultValue={v?.brandId ?? ""}>
          <option value="">No brand</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field id="ownerId" label="Owner" required error={errs.ownerId}>
        <select {...props("ownerId", "select")} defaultValue={v?.ownerId ?? ""} required>
          <option value="" disabled>Select an owner</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </Field>
      </div>
      <Field id="status" label="Status" required error={errs.status}>
        <select {...props("status", "select")} defaultValue={v?.status || "NOT_STARTED"} required>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
        </select>
      </Field>
      </Card>
      <Card className="space-y-4">
      <CardTitle>Schedule and file</CardTitle>
      <div className="grid gap-4 sm:grid-cols-2">
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
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={pending}>
          {pending ? "Saving…" : projectId ? "Save changes" : "Create project"}
        </Button>
        <Link href="/projects" className={buttonClass({ variant: "ghost" })}>Cancel</Link>
      </div>
    </form>
    </>
  );
}
