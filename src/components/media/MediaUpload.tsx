"use client";

import { useEffect, useId, useState, type ChangeEvent } from "react";
import { Plus, RotateCw } from "lucide-react";
import { registerUpload, requestUploadSignature } from "@/app/(app)/content/actions";
import { IMAGE_FORMATS, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, VIDEO_FORMATS } from "@/lib/media/config";
import { Button } from "@/components/ui/Button";
import { cn, focusRing } from "@/components/ui/cn";

type Accept = "image" | "video" | "both";
type Kind = "image" | "video";

const NOT_CONFIGURED = "Media storage is not configured";
const MIME: Record<string, Kind> = {
  "image/jpeg": "image", "image/png": "image", "image/webp": "image", "image/heic": "image",
  "video/mp4": "video", "video/quicktime": "video",
};

/** The file's kind from its MIME type, else its extension (browsers often leave HEIC untyped). */
function kindOf(f: File): Kind | null {
  if (MIME[f.type]) return MIME[f.type];
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "jpeg" || (IMAGE_FORMATS as readonly string[]).includes(ext)) return "image";
  if ((VIDEO_FORMATS as readonly string[]).includes(ext)) return "video";
  return null;
}

/** Client check against the global limits; the server re-checks size and duration when registering. */
function checkFile(f: File, accept: Accept): { kind: Kind } | { error: string } {
  const kind = kindOf(f);
  if (!kind || (accept !== "both" && accept !== kind)) return { error: "Unsupported file type" };
  if (kind === "image" && f.size > MAX_IMAGE_BYTES) return { error: "Images must be 10 MB or smaller" };
  if (kind === "video" && f.size > MAX_VIDEO_BYTES) return { error: "Videos must be 100 MB or smaller" };
  return { kind };
}

/** POSTs the file with the signed params; resolves once Cloudinary has stored it. */
function post(uploadUrl: string, params: Record<string, string>, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    for (const [k, v] of Object.entries(params)) body.append(k, v);
    body.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("upload failed"));
    };
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.send(body);
  });
}

/**
 * "+" upload button: checks the file, gets a signed upload from the server, sends it straight to Cloudinary with
 * progress, then registers it. Failures offer a retry with the same file.
 */
export function MediaUpload({ purpose, accept, onUploaded, onBusyChange, disabled = false, className }: {
  purpose: "content"; accept: Accept; onUploaded: (media: { id: string; url: string; type: "IMAGE" | "VIDEO" }) => void;
  /** Told when an upload starts and ends, so the parent can hold edits that would race it. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean; className?: string;
}) {
  const uid = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ file: File; kind: Kind } | null>(null);
  const [unconfigured, setUnconfigured] = useState(false);
  const busy = progress !== null;
  const off = disabled || unconfigured || busy;
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  async function upload(file: File, kind: Kind) {
    setError(null);
    setFailed(null);
    setProgress(0);
    try {
      const signed = await requestUploadSignature(purpose, kind);
      if (!signed.ok) {
        if (signed.code === "NOT_CONFIGURED") setUnconfigured(true);
        else setFailed({ file, kind });
        setError(signed.code === "NOT_CONFIGURED" ? NOT_CONFIGURED : signed.message);
        return;
      }
      await post(signed.upload.uploadUrl, signed.upload.params, file, setProgress);
      const type = kind === "video" ? "VIDEO" : "IMAGE";
      const reg = await registerUpload(signed.upload.publicId, type);
      if (!reg.ok) {
        setError(reg.message);
        setFailed({ file, kind });
        return;
      }
      // The sized preview (panel image or video poster), not the raw original.
      onUploaded({ id: reg.mediaId, url: reg.previewUrl, type });
    } catch {
      setError("Upload failed. Try again.");
      setFailed({ file, kind });
    } finally {
      setProgress(null);
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again still fires change
    if (!file) return;
    const r = checkFile(file, accept);
    if ("error" in r) {
      setFailed(null);
      setError(r.error);
      return;
    }
    void upload(file, r.kind);
  }

  const types = accept === "image" ? "image/*,.heic" : accept === "video" ? "video/mp4,video/quicktime" : "image/*,.heic,video/mp4,video/quicktime";
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={`${uid}-file`} aria-disabled={off || undefined}
        className={cn("relative flex aspect-[3/4] w-14 cursor-pointer items-center justify-center rounded-md border border-dashed border-border-strong bg-card text-muted-foreground",
          "transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring [&_svg]:size-5",
          off && "cursor-not-allowed opacity-55 hover:bg-card")}>
        {busy ? <span className="text-xs tabular-nums">{progress}%</span> : <Plus aria-hidden="true" />}
        <input id={`${uid}-file`} type="file" accept={types} aria-label="Add media" disabled={off} onChange={onChange}
          aria-describedby={error ? `${uid}-err` : undefined} className={cn("sr-only", focusRing)} />
      </label>
      {busy ? <span role="status" className="sr-only">{`Uploading ${progress}%`}</span> : null}
      {error ? <p id={`${uid}-err`} role="alert" className="max-w-48 text-xs text-danger">{error}</p> : null}
      {failed ? (
        <Button size="sm" variant="ghost" icon={<RotateCw />} onClick={() => void upload(failed.file, failed.kind)} className="self-start">Retry</Button>
      ) : null}
    </div>
  );
}
