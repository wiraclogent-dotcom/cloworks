"use client";

import { useRef, useState, useTransition } from "react";
import { changeProfilePhoto, clearProfilePhoto } from "./photoActions";

/** Output size in pixels. A square, centred crop keeps every photo well under the server's limit. */
const SIDE = 256;

/** Centre-crops to a square and re-encodes as JPEG on a white background (so transparent PNGs don't turn black). */
async function squareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIDE, SIDE);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.9),
  );
}

/** "Change photo" and "Remove photo" under the avatar. The new photo appears after the page refreshes. */
export function PhotoEditor({ hasPhoto }: { hasPhoto: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onPick(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    let blob: Blob;
    try {
      blob = await squareJpeg(file);
    } catch {
      setMessage("Use a JPEG, PNG or WebP picture.");
      return;
    }
    const fd = new FormData();
    fd.append("photo", blob, "photo.jpg");
    startTransition(async () => {
      const r = await changeProfilePhoto(fd);
      setMessage(r.ok ? "Photo updated." : r.message);
      if (input.current) input.current.value = "";
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
          className="inline-flex h-8 items-center rounded-lg border border-input px-3 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-60"
        >
          {pending ? "Saving…" : hasPhoto ? "Change photo" : "Add photo"}
        </button>
        {hasPhoto ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => { const r = await clearProfilePhoto(); setMessage(r.ok ? "Photo removed." : r.message); })}
            className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-60"
          >
            Remove
          </button>
        ) : null}
      </div>
      {message ? <p role="status" className="text-center text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
