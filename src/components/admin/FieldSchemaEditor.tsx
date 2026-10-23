"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { NativeSelect } from "@/components/shadcn/native-select";
import { Switch } from "@/components/shadcn/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { finalizeSchema, type FieldRow } from "@/lib/fieldSchemaEdit";

const TYPE_LABEL: Record<FieldRow["type"], string> = { text: "Short text", select: "Choice list", checkbox: "Checkbox", url: "Link" };
type Row = FieldRow & { uid: number };

/**
 * Edits a request type's extra fields as rows (spec 2026-10-23): label, type, Required, choices, order. Posts, inside
 * the surrounding form: `fieldRows` (the draft, so a failed save can restore it) and either `fieldSchema` (the stored
 * JSON) or `fieldSchemaInvalid=1` when a row has a problem, so the server never saves a half-edited schema.
 */
export function FieldSchemaEditor({ rows: initial, requestsCount, showErrors = false }: {
  rows: FieldRow[];
  /** Requests of this type: removing an existing field then asks first. */
  requestsCount: number;
  /** Mark every row's problem (after a failed save), not only the rows edited since. */
  showErrors?: boolean;
}) {
  const uid = useId();
  const next = useRef(initial.length);
  const [rows, setRows] = useState<Row[]>(() => initial.map((r, i) => ({ ...r, uid: i })));
  const [touched, setTouched] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<Row | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const result = useMemo(() => finalizeSchema(rows), [rows]);
  const errorOf = (i: number, r: Row) => (!result.ok && (showErrors || touched.has(r.uid)) ? result.errors[i] : undefined);
  const update = (u: number, patch: Partial<FieldRow>) => {
    setRows((rs) => rs.map((r) => (r.uid === u ? { ...r, ...patch } : r)));
    setTouched((t) => new Set(t).add(u));
  };
  const move = (i: number, d: -1 | 1) => setRows((rs) => {
    const out = [...rs];
    [out[i], out[i + d]] = [out[i + d], out[i]];
    return out;
  });
  const remove = (u: number) => setRows((rs) => rs.filter((r) => r.uid !== u));
  const addChoice = (r: Row) => {
    const c = (drafts[r.uid] ?? "").trim();
    if (c) update(r.uid, { options: [...r.options, c] });
    setDrafts((d) => ({ ...d, [r.uid]: "" }));
  };
  const nameOf = (r: Row, i: number) => r.label.trim() || `field ${i + 1}`;

  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium text-foreground">Fields on the new request form</legend>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No extra fields: the form asks only the usual questions.</p> : null}
      <ol className="space-y-2">
        {rows.map((r, i) => {
          const err = errorOf(i, r);
          const errId = `${uid}-err-${r.uid}`;
          const name = nameOf(r, i);
          return (
            <li key={r.uid} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-none gap-0.5">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${name} up`} title={`Move ${name} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${name} down`} title={`Move ${name} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown aria-hidden="true" />
                  </Button>
                </div>
                <Input aria-label={`Label of field ${i + 1}`} value={r.label} maxLength={60} placeholder="Label, e.g. Platform"
                  aria-invalid={err ? true : undefined} aria-describedby={err ? errId : undefined}
                  onChange={(e) => update(r.uid, { label: e.target.value })} className="min-w-40 flex-1" />
                <NativeSelect aria-label={`Type of field ${i + 1}`} value={r.type} className="w-36"
                  onChange={(e) => update(r.uid, { type: e.target.value as FieldRow["type"] })}>
                  {(Object.keys(TYPE_LABEL) as FieldRow["type"][]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </NativeSelect>
                {r.type !== "checkbox" ? (
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <Switch aria-label={`Required: ${name}`} checked={r.required} onCheckedChange={(on) => update(r.uid, { required: on })} />
                    <span aria-hidden="true">Required</span>
                  </label>
                ) : null}
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${name}`} title={`Remove ${name}`} className="ml-auto"
                  onClick={() => (r.key && requestsCount > 0 ? setConfirm(r) : remove(r.uid))}>
                  <X aria-hidden="true" />
                </Button>
              </div>
              {r.type === "select" ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-1">
                  <span className="text-xs text-muted-foreground">Choices:</span>
                  {r.options.map((c, ci) => (
                    <span key={`${c}-${ci}`} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground">
                      {c}
                      <button type="button" aria-label={`Remove choice ${c}`} title={`Remove choice ${c}`}
                        className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                        onClick={() => update(r.uid, { options: r.options.filter((_, k) => k !== ci) })}>
                        <X aria-hidden="true" className="size-3" />
                      </button>
                    </span>
                  ))}
                  <Input aria-label={`Add choice to ${name}`} placeholder="Add choice" value={drafts[r.uid] ?? ""} className="h-8 w-36"
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.uid]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChoice(r); } }}
                    onBlur={() => addChoice(r)} />
                </div>
              ) : null}
              {err ? <p id={errId} className="mt-1.5 text-xs text-danger">{err}</p> : null}
            </li>
          );
        })}
      </ol>
      <Button type="button" variant="outline" size="sm"
        onClick={() => setRows((rs) => [...rs, { key: null, label: "", type: "text", required: false, options: [], uid: next.current++ }])}>
        <Plus aria-hidden="true" />Add field
      </Button>

      <input type="hidden" name="fieldRows" value={JSON.stringify(rows.map((r) => ({ key: r.key, label: r.label, type: r.type, required: r.required, options: r.options })))} />
      {result.ok
        ? <input type="hidden" name="fieldSchema" value={JSON.stringify(result.schema)} />
        : <input type="hidden" name="fieldSchemaInvalid" value="1" />}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirm?.label.trim() || "this field"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {requestsCount} {requestsCount === 1 ? "request has" : "requests have"} answers for this field. They&apos;re kept, but won&apos;t show any more.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirm) remove(confirm.uid); setConfirm(null); }}>Remove field</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fieldset>
  );
}
