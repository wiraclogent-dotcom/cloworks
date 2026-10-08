"use client";

import { useActionState, useEffect, useRef } from "react";
import { submitRequest } from "../actions";
import type { SubmitState } from "@/lib/submitRequest";
import { errorSummary } from "@/lib/formErrors";
import Link from "next/link";
import { Clapperboard, Mail, PenTool, Send, SquareKanban, UserCheck } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import { FieldError, fieldClass, labelClass } from "@/components/ui/Field";
import { RadioCards } from "@/components/ui/RadioCards";

type Opt = { id: string; name: string };

function Field({ id, label, error, required, children }: { id: string; label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && <span aria-hidden="true" className="text-danger"> *</span>}
      </label>
      {children}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

const STEPS: { icon: React.ReactNode; title: string; text: string }[] = [
  { icon: <UserCheck aria-hidden="true" strokeWidth={1.75} />, title: "A lead assigns a designer", text: "Your request lands in Requested on the board until someone picks it up." },
  { icon: <SquareKanban aria-hidden="true" strokeWidth={1.75} />, title: "Follow progress on the board", text: "Watch it move through On progress and First look, and add comments or links on the request page." },
  { icon: <Mail aria-hidden="true" strokeWidth={1.75} />, title: "You'll be notified when it's ready", text: "Notifications are by email only: we email you when its status changes, including when it is marked Done." },
];

/** Right-column help card (static). */
function WhatHappensNext() {
  return (
    <Card className="lg:sticky lg:top-6">
      <CardTitle>What happens next</CardTitle>
      <ol className="mt-3 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span aria-hidden="true" data-tone="done" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tone-tint text-tone-text [&_svg]:size-4">{s.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground"><span className="sr-only">Step {i + 1}: </span>{s.title}</p>
              <p className="mt-0.5 text-[13px] text-foreground-secondary">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function NewRequestForm({ brands, divisions }: { brands: Opt[]; divisions: Opt[] }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitRequest, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errs = (state && !state.ok && state.fieldErrors) || {};
  const v = state?.values;
  const props = (k: string, kind: "input" | "select" | "textarea" = "input") => ({
    id: k,
    name: k,
    className: fieldClass({ kind, invalid: !!errs[k] }),
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
    <p role="status" aria-live="polite" className="sr-only">{pending ? "" : summary}</p>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
    <form ref={formRef} key={nonce} action={action} className="min-w-0 space-y-5" noValidate>
      {generic && <Alert tone="danger">{generic}</Alert>}
      <Card>
        <CardTitle>Request details</CardTitle>
        <div className="mt-4 space-y-4">
          <Field id="title" label="Title" required error={errs.title}>
            <input {...props("title")} type="text" required maxLength={200} defaultValue={v?.title} />
          </Field>
          <Field id="briefUrl" label="Brief link" error={errs.briefUrl}>
            <input {...props("briefUrl")} type="url" placeholder="https://" defaultValue={v?.briefUrl} />
          </Field>
          <Field id="notes" label="Notes" error={errs.notes}>
            <textarea {...props("notes", "textarea")} rows={4} defaultValue={v?.notes} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="brandId" label="Brand" required error={errs.brandId}>
              <select {...props("brandId", "select")} defaultValue={v?.brandId ?? ""} required>
                <option value="" disabled>Select a brand</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field id="divisionId" label="Division" required error={errs.divisionId}>
              <select {...props("divisionId", "select")} defaultValue={v?.divisionId ?? ""} required>
                <option value="" disabled>Select a division</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="sm:max-w-[calc(50%-0.5rem)]">
            <Field id="deadline" label="Deadline" error={errs.deadline}>
              <input {...props("deadline")} type="date" defaultValue={v?.deadline} />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Motion</CardTitle>
        <RadioCards className="mt-3" name="needsMotion" legend="Does this task need motion?" defaultValue={v?.needsMotion ? "yes" : "no"}
          options={[
            { value: "no", title: "No", description: "Design only", icon: <PenTool aria-hidden="true" strokeWidth={1.75} /> },
            { value: "yes", title: "Yes, needs motion", description: "A motion/video editor will also work on this", icon: <Clapperboard aria-hidden="true" strokeWidth={1.75} /> },
          ]}
          hint="Motion work is done by the motion/video editor. Marking it lets us count both the design effort and the motion effort later." />
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" loading={pending} icon={<Send aria-hidden="true" strokeWidth={1.75} />}>
          {pending ? "Creating…" : "Create request"}
        </Button>
        <Link href="/requests" className={buttonClass({ variant: "ghost" })}>Cancel</Link>
      </div>
    </form>
    <aside aria-label="What happens next" className="min-w-0">
      <WhatHappensNext />
    </aside>
    </div>
    </>
  );
}
