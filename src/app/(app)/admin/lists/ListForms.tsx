"use client";

import { AdminForm, Labeled } from "@/components/admin/AdminForm";
import { Input } from "@/components/shadcn/input";
import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, ChevronDown, Ellipsis, Trash2 } from "lucide-react";
import {
  archiveListItem, deleteListItem, saveBrand, saveBrandColor, saveDivision, saveDivisionCalendar, saveRequestType, type ListActionResult, type ListKind,
} from "./actions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Switch } from "@/components/shadcn/switch";
import { Label } from "@/components/shadcn/label";
import { RadioGroup, RadioGroupItem } from "@/components/shadcn/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/components/ui/cn";
import { BRAND_TONES, BRAND_TONE_LABEL, DIVISION_TONES, DIVISION_TONE_LABEL, brandColorTone, type BrandTone } from "@/lib/palette";
import { FieldSchemaEditor } from "@/components/admin/FieldSchemaEditor";
import { rowsFromSchema, type FieldRow } from "@/lib/fieldSchemaEdit";
import type { FieldSchema } from "@/lib/fieldSchema";

/** The editor's draft echoed back after a failed save (its own form's JSON); anything unreadable starts from `fallback`. */
function echoedRows(raw: string, fallback: FieldRow[]): FieldRow[] {
  try {
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : fallback;
  } catch {
    return fallback;
  }
}

export function NameForm({ kind, id, name }: { kind: "brand" | "division"; id?: string; name?: string }) {
  const action = kind === "brand" ? saveBrand : saveDivision;
  const noun = kind === "brand" ? "brand" : "division";
  return (
    <AdminForm
      action={action}
      prefix={`${kind}-${id ?? "new"}`}
      submitLabel={id ? "Rename" : `Add ${noun}`}
      submitAriaLabel={id ? `Rename ${name}` : undefined}
      submitVariant={id ? "outline" : "default"}
      hidden={id ? { id } : undefined}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2 gap-y-2"
    >
      {({ v, idFor, aria }) => (
        <Labeled id={idFor("name")} label={id ? `Name of ${name}` : `New ${noun} name`} className={id ? "[&>label]:sr-only" : undefined}>
          <Input id={idFor("name")} name="name" maxLength={60} defaultValue={v("name", name ?? "")} {...aria()} />
        </Labeled>
      )}
    </AdminForm>
  );
}

/** Name and fields of a request type. Archive and Restore live on the type's row, so saving never changes that state. */
export function TypeForm({ t }: { t?: { id: string; name: string; schema: FieldSchema; requests: number } }) {
  return (
    <AdminForm action={saveRequestType} prefix={`type-${t?.id ?? "new"}`} submitLabel={t ? "Save type" : "Add request type"} submitAriaLabel={t ? `Save type ${t.name}` : undefined} hidden={t ? { id: t.id } : undefined}>
      {({ v, idFor, aria, failed }) => (
        <>
          <Labeled id={idFor("name")} label="Name">
            <Input id={idFor("name")} name="name" maxLength={60} defaultValue={v("name", t?.name ?? "")} {...aria()} />
          </Labeled>
          <FieldSchemaEditor rows={echoedRows(v("fieldRows"), rowsFromSchema(t?.schema ?? []))} requestsCount={t?.requests ?? 0} showErrors={failed} />
        </>
      )}
    </AdminForm>
  );
}

export type DivisionCalendarRow = { id: string; name: string; color: string; onMarketingCalendar: boolean; sortOrder: number; leadIds: string[] };

/**
 * One division's row on Settings › Marketing calendar: lane colour, shown or not, lane order, its leads and Save
 * (spec 2026-10-19; a row since 2026-10-22). The leads popover is portaled out of the form, so the ticked ids post
 * as hidden inputs.
 */
export function DivisionCalendarForm({ division: d, members }: { division: DivisionCalendarRow; members: { id: string; name: string }[] }) {
  const [leads, setLeads] = useState<string[]>(d.leadIds);
  const names = members.filter((m) => leads.includes(m.id)).map((m) => m.name);
  const summary = names.length ? names.join(", ") : "No leads";
  return (
    <AdminForm action={saveDivisionCalendar} prefix={`divcal-${d.id}`} submitLabel="Save" submitAriaLabel={`Save calendar settings for ${d.name}`}
      submitVariant="outline" hidden={{ id: d.id }} className="flex flex-wrap items-end gap-x-5 gap-y-3">
      {({ idFor, aria }) => (
        <>
          <p data-division-name="" className="w-full font-semibold text-foreground sm:w-32 sm:self-center">{d.name}</p>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-foreground">Colour</legend>
            <RadioGroup name="color" defaultValue={d.color} className="flex flex-wrap gap-1.5">
              {DIVISION_TONES.map((tone) => (
                <RadioGroupItem key={tone} value={tone} aria-label={DIVISION_TONE_LABEL[tone]} title={DIVISION_TONE_LABEL[tone]} data-tone={tone}
                  className="size-7 border-2 border-transparent bg-tone-accent data-[state=checked]:border-foreground [&_svg]:fill-primary-foreground" />
              ))}
            </RadioGroup>
          </fieldset>
          <div className="flex min-h-9 items-center gap-2">
            <Switch id={idFor("onMarketingCalendar")} name="onMarketingCalendar" defaultChecked={d.onMarketingCalendar} />
            <Label htmlFor={idFor("onMarketingCalendar")}>On the calendar</Label>
          </div>
          <Labeled id={idFor("sortOrder")} label="Order" className="w-20">
            <Input id={idFor("sortOrder")} name="sortOrder" type="number" min={0} max={999} step={1} defaultValue={String(d.sortOrder)} {...aria()} />
          </Labeled>
          <div className="min-w-0 sm:w-56">
            <p aria-hidden="true" className="mb-1.5 text-sm font-medium text-foreground">Leads</p>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" aria-label={`Leads of ${d.name}: ${summary}`} className="w-full justify-between font-normal">
                  <span className={cn("truncate", !names.length && "text-muted-foreground")}>{summary}</span>
                  <ChevronDown aria-hidden="true" strokeWidth={1.75} className="text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="max-h-72 w-64 overflow-y-auto">
                <ul className="space-y-2">
                  {members.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-center gap-2 text-sm text-foreground" htmlFor={idFor(`lead-${m.id}`)}>
                        <Checkbox id={idFor(`lead-${m.id}`)} checked={leads.includes(m.id)}
                          onCheckedChange={(on) => setLeads((cur) => (on === true ? [...cur, m.id] : cur.filter((x) => x !== m.id)))} />
                        {m.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
            {leads.map((id) => <input key={id} type="hidden" name="leadIds" value={id} />)}
          </div>
        </>
      )}
    </AdminForm>
  );
}

/**
 * The `⋯` menu of a list row: Archive or Restore, and Delete when nothing uses the item (it asks first). Errors from the
 * server (e.g. the item became used meanwhile) show under the row.
 */
export function ListRowActions({ kind, id, name, archived, deletable }: {
  kind: ListKind; id: string; name: string; archived: boolean; deletable: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ListActionResult>) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.message);
  });
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`} title={`Actions for ${name}`} disabled={pending}>
            <Ellipsis aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => run(() => archiveListItem(kind, id, !archived))}>
            {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}{archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          {deletable ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}><Trash2 aria-hidden="true" />Delete</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <p role="alert" className="w-full text-xs text-danger">{error}</p> : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
            <AlertDialogDescription>It isn&apos;t used anywhere. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => deleteListItem(kind, id))}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** A brand's badge colour: a swatch that opens the 11 colours; picking one saves at once. */
export function BrandColourButton({ id, name, color }: { id: string; name: string; color: string }) {
  const [value, setValue] = useState<BrandTone>(brandColorTone(color));
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const pick = (next: string) => {
    const previous = value;
    setValue(brandColorTone(next));
    start(async () => {
      setError(null);
      const r = await saveBrandColor(id, next);
      if (!r.ok) { setValue(previous); setError(r.message); }
    });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Colour of ${name}: ${BRAND_TONE_LABEL[value]}`} title={`Colour of ${name}: ${BRAND_TONE_LABEL[value]}`}>
          <span aria-hidden="true" data-tone={value} className="size-4 rounded-full bg-tone-accent" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <p className="mb-2 text-sm font-medium text-foreground">Colour of {name}</p>
        <RadioGroup aria-label={`Colour of ${name}`} value={value} onValueChange={pick} className="flex flex-wrap gap-1.5">
          {BRAND_TONES.map((tone) => (
            <RadioGroupItem key={tone} value={tone} aria-label={BRAND_TONE_LABEL[tone]} title={BRAND_TONE_LABEL[tone]} data-tone={tone}
              className="size-7 border-2 border-transparent bg-tone-accent data-[state=checked]:border-foreground [&_svg]:fill-primary-foreground" />
          ))}
        </RadioGroup>
        {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
      </PopoverContent>
    </Popover>
  );
}
