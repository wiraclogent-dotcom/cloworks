"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createItem, updateItem } from "@/app/(app)/library/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FieldError, fieldClass, labelClass } from "@/components/ui/Field";
import { LibraryDialog } from "./LibraryDialog";

export type ItemDraft = {
  id?: string; title: string; url: string; description: string | null;
  categoryId: string; brandId: string | null; pinned: boolean;
};

export function ItemDialog({ item, categories, brandOptions, onClose }: {
  item: ItemDraft;
  categories: { id: string; name: string }[];
  brandOptions: { id: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const uid = useId();
  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url);
  const [description, setDescription] = useState(item.description ?? "");
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [brandId, setBrandId] = useState(item.brandId ?? "");
  const [pinned, setPinned] = useState(item.pinned);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const editing = item.id !== undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setFormError(null);
    setErrors({});
    const input = {
      title: title.trim(), url: url.trim(), description: description.trim() || null,
      categoryId, brandId: brandId || null, pinned,
    };
    const r = item.id ? await updateItem(item.id, input) : await createItem(input);
    setPending(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      if (!r.fieldErrors || Object.keys(r.fieldErrors).length === 0) setFormError(r.message);
      return;
    }
    router.refresh();
    onClose();
  }

  const f = (k: string) => ({
    id: `${uid}-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `${uid}-${k}-err` : undefined,
  });
  const err = (k: string) => <FieldError id={`${uid}-${k}-err`}>{errors[k]}</FieldError>;

  return (
    <LibraryDialog title={editing ? "Edit link" : "Add link"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <div>
          <label htmlFor={`${uid}-title`} className={labelClass}>Title</label>
          <input {...f("title")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus
            className={fieldClass({ invalid: !!errors.title })} />
          {err("title")}
        </div>
        <div>
          <label htmlFor={`${uid}-url`} className={labelClass}>Link</label>
          <input {...f("url")} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://"
            className={fieldClass({ invalid: !!errors.url })} />
          {err("url")}
        </div>
        <div>
          <label htmlFor={`${uid}-description`} className={labelClass}>Description</label>
          <textarea {...f("description")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300}
            className={fieldClass({ kind: "textarea", invalid: !!errors.description })} />
          {err("description")}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-categoryId`} className={labelClass}>Category</label>
            <select {...f("categoryId")} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className={fieldClass({ kind: "select", invalid: !!errors.categoryId })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {err("categoryId")}
          </div>
          <div>
            <label htmlFor={`${uid}-brandId`} className={labelClass}>Brand</label>
            <select {...f("brandId")} value={brandId} onChange={(e) => setBrandId(e.target.value)}
              className={fieldClass({ kind: "select", invalid: !!errors.brandId })}>
              <option value="">No brand</option>
              {brandOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {err("brandId")}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Pinned
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending}>{editing ? "Save changes" : "Add link"}</Button>
        </div>
      </form>
    </LibraryDialog>
  );
}
