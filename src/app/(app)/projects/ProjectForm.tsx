"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitProject, submitProjectInPlace } from "./actions";
import { errorSummary } from "@/lib/formErrors";
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, type ProjectFormState, type ProjectFormValues } from "@/lib/projects";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/shadcn/button";
import { Card, CardTitle } from "@/components/ui/Card";
import { DatePicker } from "@/components/ui/DatePicker";
import { fieldClass } from "@/components/ui/Field";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { FieldError } from "@/components/shadcn/field";

type Opt = { id: string; name: string };

function Field({ id, label, error, required, children }: { id: string; label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label id={`${id}-label`} htmlFor={id}>{label}{required && <span aria-hidden="true" className="text-danger"> *</span>}</Label>
      {children}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

/** Create (no `projectId`) or edit form. `initial` pre-fills an edit. Typed input survives a failed submit. */
export function ProjectForm({ brands, owners, initial, projectId, stay, onSaved, onCancel }: {
  brands: Opt[]; owners: Opt[]; initial?: ProjectFormValues; projectId?: string;
  /** Edit without leaving the page: saves through `submitProjectInPlace` (no redirect). Needs `projectId`. */
  stay?: boolean;
  /** Called once when a stay-on-page save succeeds. */
  onSaved?: () => void;
  /** Renders Cancel as a button calling this, instead of the link back to /projects. */
  onCancel?: () => void;
}) {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(
    stay && projectId ? submitProjectInPlace.bind(null, projectId) : submitProject.bind(null, projectId ?? null), null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const failed = state && !state.ok ? state : null;
  const errs = failed?.fieldErrors || {};
  const v = failed?.values ?? initial;
  // Selects still carry their field class (and its invalid border) until they move to the shadcn select; inputs get it from <Input>.
  const props = (k: string, kind: "input" | "select" = "input") => ({
    id: k, name: k, ...(kind === "select" && { className: fieldClass({ kind, invalid: !!errs[k] }) }),
    "aria-invalid": errs[k] ? (true as const) : undefined,
    "aria-describedby": errs[k] ? `${k}-error` : undefined,
  });
  // The picker keeps the field's id/name (a hidden input carries YYYY-MM-DD to the server action) and the label/error wiring.
  const dateProps = (k: string) => ({
    id: k, name: k, "aria-labelledby": `${k}-label`,
    "aria-invalid": errs[k] ? (true as const) : undefined,
    "aria-describedby": errs[k] ? `${k}-error` : undefined,
  });
  const rendered = new Set(["title", "subTitle", "brandId", "ownerId", "status", "startDate", "dueDate", "fileUrl"]);
  const orphan = Object.entries(errs).filter(([k]) => !rendered.has(k)).map(([, m]) => m);
  const hasFieldErrors = Object.keys(errs).length > 0;
  const generic = failed ? (hasFieldErrors ? orphan.join(" ") : failed.message) : "";
  const LABELS: Record<string, string> = { title: "Title", subTitle: "Sub title", brandId: "Brand", ownerId: "Owner", status: "Status", startDate: "Start date", dueDate: "Due date", fileUrl: "File link" };
  const summary = errorSummary(Object.fromEntries(Object.entries(errs).filter(([k]) => rendered.has(k))), (k) => LABELS[k] ?? "");
  const nonce = state?.nonce ?? "initial";

  const savedNonce = state?.ok ? state.nonce : null;
  const onSavedRef = useRef(onSaved);
  useEffect(() => { onSavedRef.current = onSaved; });
  useEffect(() => {
    if (savedNonce) onSavedRef.current?.();
  }, [savedNonce]);

  useEffect(() => {
    if (failed) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps -- re-run per submit, `failed` is derived from it

  return (
    <>
    {/* Outside the keyed form so the live region persists across submits and the new text is announced. */}
    <p role="status" aria-live="polite" className="sr-only">{pending ? "" : summary}</p>
    <form ref={formRef} key={nonce} action={action} className="space-y-4" noValidate>
      {generic && <Alert tone="danger">{generic}</Alert>}
      <Card className="space-y-4">
      <CardTitle>Project</CardTitle>
      <Field id="title" label="Title" required error={errs.title}>
        <Input {...props("title")} type="text" required maxLength={200} defaultValue={v?.title} />
      </Field>
      <Field id="subTitle" label="Sub title" error={errs.subTitle}>
        <Input {...props("subTitle")} type="text" maxLength={200} defaultValue={v?.subTitle} />
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
          <DatePicker {...dateProps("startDate")} value={v?.startDate || null} allowClear />
        </Field>
        <Field id="dueDate" label="Due date" error={errs.dueDate}>
          <DatePicker {...dateProps("dueDate")} value={v?.dueDate || null} allowClear />
        </Field>
      </div>
      <Field id="fileUrl" label="File link" error={errs.fileUrl}>
        <Input {...props("fileUrl")} type="text" inputMode="url" autoComplete="off" placeholder="https://… or \\server\folder" maxLength={2048} defaultValue={v?.fileUrl} />
      </Field>
      </Card>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="default" loading={pending}>
          {pending ? "Saving…" : projectId ? "Save changes" : "Create project"}
        </Button>
        {onCancel
          ? <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          : <Button asChild variant="ghost"><Link href="/projects">Cancel</Link></Button>}
      </div>
    </form>
    </>
  );
}
