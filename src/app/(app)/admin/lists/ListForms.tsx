"use client";

import { AdminForm, Labeled } from "@/components/admin/AdminForm";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { FieldDescription } from "@/components/shadcn/field";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { saveBrand, saveDivision, saveDivisionCalendar, saveRequestType } from "./actions";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Switch } from "@/components/shadcn/switch";
import { Label } from "@/components/shadcn/label";
import { RadioGroup, RadioGroupItem } from "@/components/shadcn/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/shadcn/collapsible";
import { cn, focusRing } from "@/components/ui/cn";
import { DIVISION_TONES } from "@/lib/palette";

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

export function TypeForm({ t }: { t?: { id: string; name: string; active: boolean; schemaText: string } }) {
  return (
    <AdminForm action={saveRequestType} prefix={`type-${t?.id ?? "new"}`} submitLabel={t ? "Save type" : "Add request type"} submitAriaLabel={t ? `Save type ${t.name}` : undefined} hidden={t ? { id: t.id } : undefined}>
      {({ v, idFor, aria, failed }) => (
        <>
          <Labeled id={idFor("name")} label="Name">
            <Input id={idFor("name")} name="name" maxLength={60} defaultValue={v("name", t?.name ?? "")} {...aria()} />
          </Labeled>
          <label className="flex min-h-9 items-center gap-2 text-sm font-medium text-foreground" htmlFor={idFor("active")}>
            <Checkbox id={idFor("active")} name="active" defaultChecked={failed ? v("active") === "on" : (t?.active ?? true)} />
            Active (shown on the new request form)
          </label>
          <Labeled id={idFor("fieldSchema")} label="Field schema (JSON array)">
            <Textarea id={idFor("fieldSchema")} name="fieldSchema" rows={8} spellCheck={false} className="font-mono text-compact" defaultValue={v("fieldSchema", t?.schemaText ?? "[]")} {...aria()} />
          </Labeled>
          <FieldDescription>
            Each field: key, label, type (text, select, checkbox or url), optional required and, for select, options.
          </FieldDescription>
        </>
      )}
    </AdminForm>
  );
}

export type DivisionCalendarRow = { id: string; name: string; color: string; onMarketingCalendar: boolean; sortOrder: number; leadIds: string[] };

/** Marketing Calendar settings of one division: lane colour, shown or not, lane order and its leads (spec 2026-10-19). */
export function DivisionCalendarForm({ division: d, members }: { division: DivisionCalendarRow; members: { id: string; name: string }[] }) {
  const [leads, setLeads] = useState<string[]>(d.leadIds);
  const names = members.filter((m) => leads.includes(m.id)).map((m) => m.name);
  const summary = names.length ? names.join(", ") : "No leads";
  return (
    <AdminForm action={saveDivisionCalendar} prefix={`divcal-${d.id}`} submitLabel="Save calendar settings" submitAriaLabel={`Save calendar settings for ${d.name}`}
      submitVariant="outline" hidden={{ id: d.id }}>
      {({ idFor, aria }) => (
        <>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-foreground">Colour</legend>
            <RadioGroup name="color" defaultValue={d.color} className="flex flex-wrap gap-2">
              {DIVISION_TONES.map((tone, i) => (
                <RadioGroupItem key={tone} value={tone} aria-label={`Colour ${i + 1}`} data-tone={tone}
                  className="size-7 border-2 border-transparent bg-(--tone-accent) data-[state=checked]:border-foreground [&_svg]:fill-white" />
              ))}
            </RadioGroup>
          </fieldset>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex min-h-9 items-center gap-2">
              <Switch id={idFor("onMarketingCalendar")} name="onMarketingCalendar" defaultChecked={d.onMarketingCalendar} />
              <Label htmlFor={idFor("onMarketingCalendar")}>Marketing calendar</Label>
            </div>
            <Labeled id={idFor("sortOrder")} label="Order" className="w-24">
              <Input id={idFor("sortOrder")} name="sortOrder" type="number" min={0} max={999} step={1} defaultValue={String(d.sortOrder)} {...aria()} />
            </Labeled>
          </div>
          <Collapsible className="group rounded-lg border border-border">
            <CollapsibleTrigger aria-label={`Leads of ${d.name}: ${summary}`}
              className={cn("flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted", focusRing)}>
              <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 text-muted-foreground transition-transform duration-150 group-data-[state=open]:rotate-90" />
              <span className="font-medium text-foreground">Leads</span>
              <span className="truncate text-muted-foreground">{summary}</span>
            </CollapsibleTrigger>
            {/* keepMounted: unopened lead checkboxes still post with the form. */}
            <CollapsibleContent keepMounted className="border-t border-border p-3">
              <ul className="grid gap-2 sm:grid-cols-2">
                {members.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-center gap-2 text-sm text-foreground" htmlFor={idFor(`lead-${m.id}`)}>
                      <Checkbox id={idFor(`lead-${m.id}`)} name="leadIds" value={m.id} checked={leads.includes(m.id)}
                        onCheckedChange={(on) => setLeads((cur) => (on === true ? [...cur, m.id] : cur.filter((x) => x !== m.id)))} />
                      {m.name}
                    </label>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </AdminForm>
  );
}
