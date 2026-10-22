"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAnnouncement } from "@/app/(app)/marketing/actions";
import { safeAction } from "@/lib/safeAction";
import type { CalAnnouncement } from "@/lib/marketing/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { Textarea } from "@/components/shadcn/textarea";
import { FieldError } from "@/components/shadcn/field";

/** Add (`announcement` null) or edit an admin announcement of the month shown: text only (monthly since 2026-10-22). */
export function AnnouncementDialog({ month, announcement, open, onOpenChange }: {
  month: string; announcement: CalAnnouncement | null; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{announcement ? "Edit announcement" : "Add announcement"}</DialogTitle></DialogHeader>
        {/* Keyed so reopening starts from the saved values. */}
        {open ? <AnnouncementForm key={announcement?.id ?? "new"} month={month} announcement={announcement} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AnnouncementForm({ month, announcement, onDone }: { month: string; announcement: CalAnnouncement | null; onDone: () => void }) {
  const router = useRouter();
  const id = useId();
  const [body, setBody] = useState(announcement?.body ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await safeAction(() => saveAnnouncement(announcement?.id ?? null, { month, body }));
      if (res.ok) { onDone(); router.refresh(); return; }
      setErrors(("fieldErrors" in res && res.fieldErrors) || {});
      setMessage("fieldErrors" in res && res.fieldErrors ? null : res.message);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {message ? <Alert variant="destructive"><AlertDescription><p>{message}</p></AlertDescription></Alert> : null}
      <div>
        <Label htmlFor={`${id}-body`} className="mb-1.5">Announcement</Label>
        <Textarea id={`${id}-body`} rows={4} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)}
          aria-invalid={errors.body ? true : undefined} aria-describedby={errors.body ? `${id}-body-error` : undefined} />
        <FieldError id={`${id}-body-error`}>{errors.body}</FieldError>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="default" loading={pending}>Save</Button>
      </DialogFooter>
    </form>
  );
}
