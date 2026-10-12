"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createChannel } from "@/app/(app)/content/actions";
import { planHref } from "@/lib/content/params";
import { Alert } from "@/components/ui/Alert";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { FieldError, fieldClass, hintClass, labelClass } from "@/components/ui/Field";
import { LibraryDialog } from "@/components/library/LibraryDialog";

export type BrandOption = { id: string; name: string };

/** New Instagram channel: brand, handle, display name, bio. The avatar is added later from the post panel's uploader. */
export function ChannelForm({ brands, onClose }: { brands: BrandOption[]; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(null);
    let r;
    try { r = await createChannel({ brandId, handle, displayName, bio }); }
    catch { setFormError("Something went wrong. Try again."); return; }
    finally { setPending(false); }
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      if (!r.fieldErrors || Object.keys(r.fieldErrors).length === 0) setFormError(r.message);
      return;
    }
    onClose();
    router.push(planHref({ channel: r.id }));
  }

  const f = (k: string) => ({
    id: `${uid}-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `${uid}-${k}-err` : undefined,
  });
  const err = (k: string) => <FieldError id={`${uid}-${k}-err`}>{errors[k]}</FieldError>;

  return (
    <LibraryDialog title="Add channel" onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        {brands.length === 0 ? <Alert tone="warning" role={null}>Add a brand in Admin → Lists first.</Alert> : null}
        <div>
          <label htmlFor={`${uid}-brandId`} className={labelClass}>Brand</label>
          <select {...f("brandId")} value={brandId} onChange={(e) => setBrandId(e.target.value)}
            className={fieldClass({ kind: "select", invalid: !!errors.brandId })}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {err("brandId")}
        </div>
        <div>
          <label htmlFor={`${uid}-handle`} className={labelClass}>Instagram handle</label>
          <input {...f("handle")} value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={31} autoFocus
            placeholder="@brand" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            className={fieldClass({ invalid: !!errors.handle })} />
          {err("handle")}
        </div>
        <div>
          <label htmlFor={`${uid}-displayName`} className={labelClass}>Display name</label>
          <input {...f("displayName")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60}
            className={fieldClass({ invalid: !!errors.displayName })} />
          {err("displayName")}
        </div>
        <div>
          <label htmlFor={`${uid}-bio`} className={labelClass}>Bio</label>
          <textarea {...f("bio")} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={150}
            className={fieldClass({ kind: "textarea", invalid: !!errors.bio })} />
          {errors.bio ? err("bio") : <p className={hintClass}>Optional, up to 150 characters.</p>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending} disabled={brands.length === 0}>Add channel</Button>
        </div>
      </form>
    </LibraryDialog>
  );
}

/** Button that opens <ChannelForm>. Channel managers only (the caller decides). */
export function AddChannelButton({ brands, children, variant = "secondary", size = "md", icon }: {
  brands: BrandOption[]; children: ReactNode; variant?: ButtonVariant; size?: "sm" | "md"; icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} icon={icon} onClick={() => setOpen(true)}>{children}</Button>
      {open ? <ChannelForm brands={brands} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
