"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createChannel, updateChannel } from "@/app/(app)/content/actions";
import { planHref } from "@/lib/content/params";
import type { ChannelSummary } from "@/lib/content/view";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Avatar } from "@/components/ui/Avatar";
import { Button, type ButtonProps } from "@/components/shadcn/button";
import { NativeSelect } from "@/components/shadcn/native-select";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Label } from "@/components/shadcn/label";
import { labelClassName } from "@/components/shadcn/label-class";
import { FieldDescription, FieldError } from "@/components/shadcn/field";
import { LibraryDialog } from "@/components/library/LibraryDialog";
import { MediaUpload } from "@/components/media/MediaUpload";

export type BrandOption = { id: string; name: string };

/**
 * Instagram channel form: brand, handle, display name, bio and an avatar picker. Adds a channel, or edits `channel`
 * (pre-filled; saving keeps its current avatar unless the picker changed it).
 */
export function ChannelForm({ brands, channel, onClose }: { brands: BrandOption[]; channel?: ChannelSummary; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [brandId, setBrandId] = useState(channel?.brandId ?? brands[0]?.id ?? "");
  const [handle, setHandle] = useState(channel?.handle ?? "");
  const [displayName, setDisplayName] = useState(channel?.displayName ?? "");
  const [bio, setBio] = useState(channel?.bio ?? "");
  const [avatar, setAvatar] = useState<{ id: string | null; url: string | null }>({ id: channel?.avatarMediaId ?? null, url: channel?.avatarUrl ?? null });
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(null);
    let r;
    let createdId: string | null = null;
    const input = { brandId, handle, displayName, bio, avatarMediaId: avatar.id };
    try {
      if (channel) r = await updateChannel(channel.id, input);
      else { const c = await createChannel(input); r = c; if (c.ok) createdId = c.id; }
    }
    catch { setFormError("Something went wrong. Try again."); return; }
    finally { setPending(false); }
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      if (!r.fieldErrors || Object.keys(r.fieldErrors).length === 0) setFormError(r.message);
      return;
    }
    onClose();
    if (createdId) router.push(planHref({ channel: createdId }));
    else router.refresh();
  }

  const f = (k: string) => ({
    id: `${uid}-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `${uid}-${k}-err` : undefined,
  });
  const err = (k: string) => <FieldError id={`${uid}-${k}-err`}>{errors[k]}</FieldError>;

  return (
    <LibraryDialog title={channel ? "Edit channel" : "Add channel"} onClose={onClose}>
      <form onSubmit={submit} noValidate className="space-y-4">
        {formError ? <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert> : null}
        {brands.length === 0 ? <Alert variant="warning" role={null}><AlertDescription>Add a brand in Admin → Lists first.</AlertDescription></Alert> : null}
        <div>
          <Label htmlFor={`${uid}-brandId`}>Brand</Label>
          <NativeSelect {...f("brandId")} value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </NativeSelect>
          {err("brandId")}
        </div>
        <div>
          <Label htmlFor={`${uid}-handle`}>Instagram handle</Label>
          <Input {...f("handle")} value={handle} onChange={(e) => setHandle(e.target.value)} maxLength={31} autoFocus
            placeholder="@brand" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
          {err("handle")}
        </div>
        <div>
          <Label htmlFor={`${uid}-displayName`}>Display name</Label>
          <Input {...f("displayName")} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} />
          {err("displayName")}
        </div>
        <div>
          <Label htmlFor={`${uid}-bio`}>Bio</Label>
          <Textarea {...f("bio")} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={150} />
          {errors.bio ? err("bio") : <FieldDescription>Optional, up to 150 characters.</FieldDescription>}
        </div>
        <div>
          <span className={labelClassName}>Avatar</span>
          <div className="flex items-end gap-3">
            <Avatar name={displayName || handle || "?"} src={avatar.url} size="lg" decorative />
            <MediaUpload purpose="content" accept="image" onUploaded={(m) => setAvatar({ id: m.id, url: m.url })} onBusyChange={setUploading} />
            {avatar.id ? <Button variant="ghost" size="sm" onClick={() => setAvatar({ id: null, url: null })}>Remove avatar</Button> : null}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="default" loading={pending} disabled={brands.length === 0 || uploading}>{channel ? "Save" : "Add channel"}</Button>
        </div>
      </form>
    </LibraryDialog>
  );
}

/** Button that opens <ChannelForm>. Channel managers only (the caller decides). */
export function AddChannelButton({ brands, children, variant = "outline", size = "default", icon }: {
  brands: BrandOption[]; children: ReactNode; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} icon={icon} onClick={() => setOpen(true)}>{children}</Button>
      {open ? <ChannelForm brands={brands} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
