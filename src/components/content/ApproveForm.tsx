"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { approvePost } from "@/app/(app)/content/actions";
import type { ApproveFormData, ApproveInput } from "@/lib/content/approve";
import { parseFieldSchema, type FieldDef } from "@/lib/fieldSchema";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FieldError, fieldClass, labelClass } from "@/components/ui/Field";

type Values = Record<string, string | boolean>;

/** Only the type fields with a value: blank text is left out (the server reports required ones), checkboxes always sent. */
function fieldsOf(defs: FieldDef[], values: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of defs) {
    const v = values[f.key];
    if (f.type === "checkbox") out[f.key] = v === true;
    else if (typeof v === "string" && v.trim()) out[f.key] = v;
  }
  return out;
}

function Row({ id, label, error, required, children }: { id: string; label: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required ? <span aria-hidden="true" className="text-danger"> *</span> : null}
      </label>
      {children}
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </div>
  );
}

/**
 * Approve & create request: the lead checks the pre-filled request (title, division, type and its fields, assignee,
 * deadline, outputs, motion) and creates it. Field errors from the server render under their fields.
 */
export function ApproveForm({ form, authorName, mockupCount, onCancel, onApproved }: {
  form: ApproveFormData; authorName: string; mockupCount: number; onCancel: () => void; onApproved: (requestId: string) => void;
}) {
  const uid = useId();
  const router = useRouter();
  const d = form.defaults;
  const [title, setTitle] = useState(d.title);
  const [divisionId, setDivisionId] = useState(form.divisionId ?? "");
  // No suggested or default type: the first active one, so the select never shows a value it does not send.
  const [typeId, setTypeId] = useState(d.typeId ?? form.types[0]?.id ?? "");
  const [assigneeId, setAssigneeId] = useState("");
  const [deadline, setDeadline] = useState(d.deadline ?? "");
  const [outputCount, setOutputCount] = useState(String(d.outputCount));
  const [needsMotion, setNeedsMotion] = useState(d.needsMotion);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const defs = parseFieldSchema(form.types.find((t) => t.id === typeId)?.fieldSchema);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    const input: ApproveInput = {
      title, divisionId, typeId, deadline: deadline || null, assigneeIds: assigneeId ? [assigneeId] : [], needsMotion,
      outputCount: Number(outputCount), fields: fieldsOf(defs, values),
    };
    try {
      const r = await approvePost(form.postId, input);
      if (r.ok) {
        onApproved(r.requestId);
        return;
      }
      const fe = r.fieldErrors ?? {};
      setErrors(fe);
      // Errors with no field here (e.g. "form") go in the banner.
      const shown = new Set(["title", "divisionId", "typeId", "assigneeIds", "deadline", "outputCount", ...defs.map((f) => `fields.${f.key}`)]);
      const orphan = Object.entries(fe).filter(([k]) => !shown.has(k)).map(([, m]) => m);
      setMessage(Object.keys(fe).length ? (orphan.join(" ") || null) : r.message);
      // Approved or sent back elsewhere meanwhile: reload so the panel shows where the post is now.
      if (r.code === "CONFLICT") router.refresh();
    } catch {
      setMessage("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  const id = (k: string) => `${uid}-${k}`;
  const props = (k: string, kind: "input" | "select" = "input") => ({
    id: id(k),
    className: fieldClass({ kind, invalid: !!errors[k] }),
    "aria-invalid": errors[k] ? (true as const) : undefined,
    "aria-describedby": errors[k] ? `${id(k)}-err` : undefined,
  });

  return (
    <form aria-label="Approve & create request" onSubmit={submit} noValidate className="flex flex-col gap-3">
      {message ? <Alert tone="danger">{message}</Alert> : null}
      <Row id={id("title")} label="Title" required error={errors.title}>
        <input {...props("title")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      </Row>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row id={id("divisionId")} label="Division" required error={errors.divisionId}>
          <select {...props("divisionId", "select")} value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
            <option value="" disabled>Select a division</option>
            {form.divisions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Row>
        <Row id={id("typeId")} label="Type" error={errors.typeId}>
          <select {...props("typeId", "select")} value={typeId} onChange={(e) => { setTypeId(e.target.value); setValues({}); }}>
            {form.types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Row>
      </div>
      {defs.map((f) => {
        const k = `fields.${f.key}`;
        if (f.type === "checkbox") {
          return (
            <div key={f.key}>
              <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <input type="checkbox" id={id(k)} checked={values[f.key] === true} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                  aria-invalid={errors[k] ? true : undefined} aria-describedby={errors[k] ? `${id(k)}-err` : undefined} />
                {f.label}
                {f.required ? <span aria-hidden="true" className="text-danger"> *</span> : null}
              </label>
              <FieldError id={`${id(k)}-err`}>{errors[k]}</FieldError>
            </div>
          );
        }
        const value = typeof values[f.key] === "string" ? (values[f.key] as string) : "";
        const set = (v: string) => setValues((s) => ({ ...s, [f.key]: v }));
        return (
          <Row key={f.key} id={id(k)} label={f.label} required={f.required} error={errors[k]}>
            {f.type === "select" ? (
              <select {...props(k, "select")} value={value} onChange={(e) => set(e.target.value)}>
                <option value="">Select…</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input {...props(k)} type={f.type === "url" ? "url" : "text"} value={value} onChange={(e) => set(e.target.value)} />
            )}
          </Row>
        );
      })}
      <div className="grid gap-3 sm:grid-cols-2">
        <Row id={id("assigneeIds")} label="Assignee" error={errors.assigneeIds}>
          <select {...props("assigneeIds", "select")} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {form.team.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Row>
        <Row id={id("deadline")} label="Deadline" error={errors.deadline}>
          <input {...props("deadline")} type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Row>
        <Row id={id("outputCount")} label="Outputs" error={errors.outputCount}>
          <input {...props("outputCount")} type="number" min={1} step={1} inputMode="numeric" value={outputCount} onChange={(e) => setOutputCount(e.target.value)} />
        </Row>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <input type="checkbox" checked={needsMotion} onChange={(e) => setNeedsMotion(e.target.checked)} />
            Needs motion
          </label>
        </div>
      </div>
      <p className="text-xs text-foreground-secondary">
        {`Brief → request notes · ${mockupCount} mock-up${mockupCount === 1 ? "" : "s"} → attachments · requester = ${authorName}`}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" icon={<CheckCheck />} loading={pending}>Approve &amp; create</Button>
      </div>
    </form>
  );
}
