"use client";

import { AdminForm, Labeled, control, textareaControl } from "@/components/admin/AdminForm";
import { hintClass } from "@/components/ui/Field";
import { saveBrand, saveDivision, saveRequestType } from "./actions";

export function NameForm({ kind, id, name }: { kind: "brand" | "division"; id?: string; name?: string }) {
  const action = kind === "brand" ? saveBrand : saveDivision;
  const noun = kind === "brand" ? "brand" : "division";
  return (
    <AdminForm
      action={action}
      prefix={`${kind}-${id ?? "new"}`}
      submitLabel={id ? "Rename" : `Add ${noun}`}
      submitAriaLabel={id ? `Rename ${name}` : undefined}
      submitVariant={id ? "secondary" : "primary"}
      hidden={id ? { id } : undefined}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2 gap-y-2"
    >
      {({ v, idFor, aria }) => (
        <Labeled id={idFor("name")} label={id ? `Name of ${name}` : `New ${noun} name`} className={id ? "[&>label]:sr-only" : undefined}>
          <input id={idFor("name")} name="name" maxLength={60} className={control} defaultValue={v("name", name ?? "")} {...aria()} />
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
            <input id={idFor("name")} name="name" maxLength={60} className={control} defaultValue={v("name", t?.name ?? "")} {...aria()} />
          </Labeled>
          <label className="flex min-h-9 items-center gap-2 text-sm font-medium text-foreground" htmlFor={idFor("active")}>
            <input id={idFor("active")} name="active" type="checkbox" className="size-4 accent-primary" defaultChecked={failed ? v("active") === "on" : (t?.active ?? true)} />
            Active (shown on the new request form)
          </label>
          <Labeled id={idFor("fieldSchema")} label="Field schema (JSON array)">
            <textarea id={idFor("fieldSchema")} name="fieldSchema" rows={8} spellCheck={false} className={`${textareaControl} font-mono text-[13px]`} defaultValue={v("fieldSchema", t?.schemaText ?? "[]")} {...aria()} />
          </Labeled>
          <p className={hintClass}>
            Each field: key, label, type (text, select, checkbox or url), optional required and, for select, options.
          </p>
        </>
      )}
    </AdminForm>
  );
}
