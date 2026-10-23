"use client";

import { AdminForm, Labeled } from "@/components/admin/AdminForm";
import { Input } from "@/components/shadcn/input";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { saveBrand, saveDivision, saveDivisionCalendar, saveRequestType } from "./actions";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Switch } from "@/components/shadcn/switch";
import { Label } from "@/components/shadcn/label";
import { RadioGroup, RadioGroupItem } from "@/components/shadcn/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/components/ui/cn";
import { DIVISION_TONES, DIVISION_TONE_LABEL } from "@/lib/palette";
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
