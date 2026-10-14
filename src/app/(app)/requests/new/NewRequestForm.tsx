"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitRequest } from "../actions";
import type { SubmitState, WorkKind } from "@/lib/submitRequest";
import { errorSummary } from "@/lib/formErrors";
import Link from "next/link";
import { Clapperboard, Image as ImageIcon, Mail, Scissors, Send, SquareKanban, UserCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Card, CardTitle } from "@/components/shadcn/card";
import { NativeSelect } from "@/components/shadcn/native-select";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Label } from "@/components/shadcn/label";
import { FieldError } from "@/components/shadcn/field";
import { RadioCards } from "@/components/ui/RadioCards";

type Opt = { id: string; name: string };

function Field({ id, label, error, required, hint, children }: { id: string; label: string; error?: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true" className="text-danger"> *</span>}
      </Label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

/** Numbered card heading so the form reads as one journey, top to bottom. */
function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2">
      <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground tabular-nums">{n}</span>
      {children}
    </CardTitle>
  );
}

const KIND_OPTIONS: { value: WorkKind; title: string; description: string; icon: React.ReactNode }[] = [
  { value: "static", title: "Static design", description: "Feed post, banner, packaging, PDP image", icon: <ImageIcon aria-hidden="true" strokeWidth={1.75} /> },
  { value: "motion", title: "Design + motion", description: "A designer makes it, the video editor animates it", icon: <Clapperboard aria-hidden="true" strokeWidth={1.75} /> },
  { value: "video", title: "Video edit only", description: "Cut, edit or subtitle existing footage", icon: <Scissors aria-hidden="true" strokeWidth={1.75} /> },
];

/** Placeholders and hints that follow the picked kind ("" = nothing picked yet). */
const KIND_COPY: Record<WorkKind | "", { title: string; brief: string; notes: string; assignee: string }> = {
  "": { title: "What should we make?", brief: "Google Doc or Drive folder", notes: "Sizes, copy, references", assignee: "a designer" },
  static: { title: "e.g. Feed post – Laundry Pods promo", brief: "Google Doc or Drive folder with the copy and references", notes: "Sizes, copy, references", assignee: "a designer" },
  motion: { title: "e.g. Animated banner – 10.10 sale", brief: "Google Doc or Drive folder with the copy and references", notes: "Sizes, copy, and what should move", assignee: "a designer and a video editor" },
  video: { title: "e.g. Reel edit – Bubble Wash review", brief: "Drive folder with the raw footage", notes: "Length, aspect ratio, cuts, subtitles, music", assignee: "a video editor" },
};

/** How many assignee selects a kind starts with: a designer and a video editor for Design + motion, otherwise one. */
const baseSlots = (kind: WorkKind | ""): number => (kind === "motion" ? 2 : 1);

/** Jakarta calendar date `days` from today, as YYYY-MM-DD (what the date input and the server expect). */
function jakartaDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const QUICK_DEADLINES = [{ label: "Tomorrow", days: 1 }, { label: "In 3 days", days: 3 }, { label: "Next week", days: 7 }];

const STEPS = (assignee: string): { icon: React.ReactNode; title: string; text: string }[] => [
  { icon: <UserCheck aria-hidden="true" strokeWidth={1.75} />, title: `A lead assigns ${assignee}`, text: "Your request lands in Requested on the board until someone picks it up." },
  { icon: <SquareKanban aria-hidden="true" strokeWidth={1.75} />, title: "Follow progress on the board", text: "Watch it move through On progress and First look, and add comments or links on the request page." },
  { icon: <Mail aria-hidden="true" strokeWidth={1.75} />, title: "You'll be notified when it's ready", text: "Notifications are by email only: we email you when its status changes, including when it is marked Done." },
];

/** Right-column help card. The sticky offset sits on the `<aside>` (the grid cell is as tall as the form), not on the card, which would have nothing to stick within. */
function WhatHappensNext({ assignee }: { assignee: string }) {
  return (
    <Card>
      <CardTitle>What happens next</CardTitle>
      <ol className="mt-3 space-y-4">
        {STEPS(assignee).map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span aria-hidden="true" data-tone="done" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tone-tint text-tone-text [&_svg]:size-4">{s.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground"><span className="sr-only">Step {i + 1}: </span>{s.title}</p>
              <p className="mt-0.5 text-compact text-muted-foreground">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function NewRequestForm({ brands, divisions, assignees = [] }: { brands: Opt[]; divisions: Opt[]; assignees?: Opt[] }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitRequest, null);
  const formRef = useRef<HTMLFormElement>(null);
  const errs = (state && !state.ok && state.fieldErrors) || {};
  const v = state?.values;
  const props = (k: string) => ({
    id: k,
    name: k,
    "aria-invalid": errs[k] ? (true as const) : undefined,
    "aria-describedby": errs[k] ? `${k}-error` : undefined,
  });
  // Errors with no rendered field (e.g. "form", unknown detail keys) go in the banner.
  const rendered = new Set(["workKind", "title", "briefUrl", "notes", "brandId", "divisionId", "assigneeIds", "deadline"]);
  const orphan = Object.entries(errs).filter(([k]) => !rendered.has(k)).map(([, m]) => m);
  const hasFieldErrors = Object.keys(errs).length > 0;
  const generic = state && !state.ok ? (hasFieldErrors ? orphan.join(" ") : state.message) : "";
  const LABELS: Record<string, string> = { workKind: "What do you need", title: "Title", briefUrl: "Brief link", notes: "Notes", brandId: "Brand", divisionId: "Division", assigneeIds: "Assignees", deadline: "Deadline" };
  const summary = errorSummary(Object.fromEntries(Object.entries(errs).filter(([k]) => rendered.has(k))), (k) => LABELS[k] ?? "");

  // React 19 resets uncontrolled fields after the action; the key remounts them with defaults from the echoed values.
  const nonce = state?.nonce ?? "initial";
  // The picked kind drives the hints; after a failed submit it follows the echoed value.
  const [kind, setKind] = useState<WorkKind | "">(v?.workKind ?? "");
  // Assignee slots: Design + motion asks for a designer and a video editor, anything else for one person; "+ Add person" adds more.
  const [extraSlots, setExtraSlots] = useState(0);
  const [seenNonce, setSeenNonce] = useState(nonce);
  if (seenNonce !== nonce) {
    setSeenNonce(nonce);
    setKind(v?.workKind ?? "");
    setExtraSlots(Math.max(0, (v?.assigneeIds.length ?? 0) - baseSlots(v?.workKind ?? "")));
  }
  const base = baseSlots(kind);
  const slotCount = base + extraSlots;
  const slotLabel = (i: number) => (kind === "motion" ? ["Designer", "Video editor"][i] : i === 0 ? "Assignee" : undefined) ?? "Another person";
  const describedBy = [errs.assigneeIds ? "assigneeIds-error" : "", "assigneeIds-hint"].filter(Boolean).join(" ");
  const lastSlotRef = useRef<HTMLSelectElement>(null);
  const focusNewSlot = useRef(false);
  const addPerson = () => { focusNewSlot.current = true; setExtraSlots((n) => n + 1); };
  useEffect(() => {
    if (focusNewSlot.current) { focusNewSlot.current = false; lastSlotRef.current?.focus(); }
  }, [extraSlots]);
  const copy = KIND_COPY[kind];
  const deadlineRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.nonce) {
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]:not([role="radiogroup"]), [data-invalid] [role="radio"]');
      first?.focus();
    }
  }, [state?.nonce]);

  return (
    <>
    {/* Outside the keyed form so the live region persists across submits and the new text is announced. */}
    <p role="status" aria-live="polite" className="sr-only">{pending ? "" : summary}</p>
    <div className="@container">
    <div className="grid items-start gap-5 @3xl:grid-cols-[minmax(0,1fr)_20rem]">
    <form ref={formRef} key={nonce} action={action} className="min-w-0 space-y-5" noValidate>
      {generic && <Alert variant="destructive"><AlertDescription>{generic}</AlertDescription></Alert>}
      <Card>
        <StepTitle n={1}>What do you need?</StepTitle>
        <div className="mt-3" data-invalid={errs.workKind ? "" : undefined}>
          <RadioCards name="workKind" legend={<span className="sr-only">What do you need?</span>} columns={1} options={KIND_OPTIONS}
            defaultValue={v?.workKind || undefined} onChange={(k) => { setKind(k as WorkKind); setExtraSlots(0); }}
            invalid={!!errs.workKind} describedBy={errs.workKind ? "workKind-error" : undefined} />
          <FieldError id="workKind-error">{errs.workKind}</FieldError>
        </div>
      </Card>

      <Card>
        <StepTitle n={2}>Which brand &amp; team?</StepTitle>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id="brandId" label="Brand" required error={errs.brandId}>
            <NativeSelect {...props("brandId")} defaultValue={v?.brandId ?? ""} required>
              <option value="" disabled>Select a brand</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </NativeSelect>
          </Field>
          <Field id="divisionId" label="Division" required error={errs.divisionId}>
            <NativeSelect {...props("divisionId")} defaultValue={v?.divisionId ?? ""} required>
              <option value="" disabled>Select a division</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </NativeSelect>
          </Field>
          <div className="sm:col-span-2">
            <div role="group" aria-label="Assignees" aria-describedby={describedBy}>
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: slotCount }, (_, i) => {
                  const id = i === 0 ? "assigneeIds" : `assigneeIds-${i + 1}`;
                  return (
                    <div key={i}>
                      <Label htmlFor={id}>{slotLabel(i)}</Label>
                      <NativeSelect {...props("assigneeIds")} id={id} ref={i === slotCount - 1 ? lastSlotRef : undefined}
                        defaultValue={v?.assigneeIds[i] ?? ""} aria-describedby={describedBy}>
                        <option value="">{i < base ? "Unassigned" : "Choose someone"}</option>
                        {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </NativeSelect>
                    </div>
                  );
                })}
              </div>
              <p id="assigneeIds-hint" className="mt-1 text-xs text-muted-foreground">Optional. Leave it unassigned and a lead will pick someone.</p>
              <FieldError id="assigneeIds-error">{errs.assigneeIds}</FieldError>
              <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={addPerson}>+ Add person</Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <StepTitle n={3}>Describe it</StepTitle>
        <div className="mt-4 space-y-4">
          <Field id="title" label="Title" required error={errs.title}>
            <Input {...props("title")} type="text" required maxLength={200} placeholder={copy.title} defaultValue={v?.title} />
          </Field>
          <Field id="briefUrl" label="Brief link" hint={copy.brief} error={errs.briefUrl}>
            <Input {...props("briefUrl")} type="url" placeholder="https://" defaultValue={v?.briefUrl}
              aria-describedby={[errs.briefUrl ? "briefUrl-error" : "", "briefUrl-hint"].filter(Boolean).join(" ")} />
          </Field>
          <Field id="notes" label="Notes" error={errs.notes}>
            <Textarea {...props("notes")} rows={4} placeholder={copy.notes} defaultValue={v?.notes} />
          </Field>
        </div>
      </Card>

      <Card>
        <StepTitle n={4}>When do you need it?</StepTitle>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-56">
            <Field id="deadline" label="Deadline" error={errs.deadline}>
              <Input {...props("deadline")} ref={deadlineRef} type="date" defaultValue={v?.deadline} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 pb-px" role="group" aria-label="Quick deadline">
            {QUICK_DEADLINES.map((q) => (
              <Button key={q.label} type="button" variant="outline" size="sm"
                onClick={() => { if (deadlineRef.current) deadlineRef.current.value = jakartaDatePlus(q.days); }}>
                {q.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="default" loading={pending} icon={<Send aria-hidden="true" strokeWidth={1.75} />}>
          {pending ? "Creating…" : "Create request"}
        </Button>
        <Button asChild variant="ghost"><Link href="/requests">Cancel</Link></Button>
      </div>
    </form>
    <aside aria-label="What happens next" className="min-w-0 @3xl:sticky @3xl:top-6 in-data-[slot=sheet-content]:@3xl:top-16">
      <WhatHappensNext assignee={copy.assignee} />
    </aside>
    </div>
    </div>
    </>
  );
}
