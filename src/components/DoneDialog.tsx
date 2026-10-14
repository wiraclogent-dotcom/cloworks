"use client";

import { useId, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { FieldError } from "@/components/shadcn/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { FILE_LOCATION_HINT, isFileLocation } from "@/lib/fileLocation";

/** Mirrors MAX_OUTPUT_COUNT in src/lib/transition.ts (kept local: that module is server-side). */
const MAX_OUTPUTS = 1000;

export type DoneDetails = { outputCount: number; designFolderUrl?: string };

/**
 * Modal asking for the delivery details when a request is marked Done (a shadcn Dialog, mounted only while open).
 * Radix traps focus, starts on the count field, and closes on Esc, which only closes the topmost dialog: over the
 * request side panel, Esc cancels this and leaves the panel open. Focus returns to the opener on close.
 */
export function DoneDialog({ title, onCancel, onSubmit }: { title: string; onCancel: () => void; onSubmit: (d: DoneDetails) => void }) {
  const uid = useId();
  const [count, setCount] = useState("1");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<{ count?: string; url?: string }>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: { count?: string; url?: string } = {};
    const n = Number(count);
    if (!/^\d{1,4}$/.test(count.trim()) || n < 1 || n > MAX_OUTPUTS) errs.count = `Enter a whole number from 1 to ${MAX_OUTPUTS}.`;
    const u = url.trim();
    if (u && !isFileLocation(u)) errs.url = `${FILE_LOCATION_HINT}.`;
    setErrors(errs);
    if (errs.count || errs.url) return;
    onSubmit({ outputCount: n, ...(u ? { designFolderUrl: u } : {}) });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent showClose={false} className="max-w-md bg-card p-6 text-card-foreground sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" data-tone="done" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tone-tint text-tone-text">
            <CircleCheck strokeWidth={1.75} className="size-5" />
          </span>
          <DialogHeader className="gap-0.5">
            <DialogTitle>Mark as done</DialogTitle>
            <DialogDescription className="break-words">“{title}” is finished. Tell us what was delivered.</DialogDescription>
          </DialogHeader>
        </div>
        <form onSubmit={submit} noValidate className="mt-1 space-y-4">
          <div>
            <Label htmlFor={`${uid}-n`}>Number of outputs <span aria-hidden="true">*</span></Label>
            <Input id={`${uid}-n`} inputMode="numeric" pattern="[0-9]*" maxLength={4} value={count} onChange={(e) => setCount(e.target.value)}
              aria-invalid={!!errors.count} aria-describedby={errors.count ? `${uid}-ne` : undefined} className="tabular-nums" />
            <FieldError id={`${uid}-ne`}>{errors.count}</FieldError>
          </div>
          <div>
            <Label htmlFor={`${uid}-u`}>Design folder link or server path (optional)</Label>
            <Input id={`${uid}-u`} type="text" inputMode="url" autoComplete="off" maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… or \\server\folder"
              aria-invalid={!!errors.url} aria-describedby={errors.url ? `${uid}-ue` : undefined} />
            <FieldError id={`${uid}-ue`}>{errors.url}</FieldError>
          </div>
          <DialogFooter className="flex-row justify-end pt-1">
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button type="submit" variant="default">Mark as done</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
