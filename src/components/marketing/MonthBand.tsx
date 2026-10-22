"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { deleteAnnouncement, saveProductFocus } from "@/app/(app)/marketing/actions";
import { safeAction } from "@/lib/safeAction";
import type { CalAnnouncement, MarketingMonthData } from "@/lib/marketing/types";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { Textarea } from "@/components/shadcn/textarea";
import { FieldError } from "@/components/shadcn/field";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { cn } from "@/components/ui/cn";
import { AnnouncementDialog } from "./AnnouncementDialog";

/**
 * Above the calendar: the month's product focus (solid blue lead card) and the admin's announcements (spec 2026-10-19).
 * Members never see an empty card; admins get an invitation instead.
 */
export function MonthBand({ data }: { data: MarketingMonthData }) {
  const admin = data.canManageMonth;
  const showFocus = admin || data.productFocus !== null;
  const showNotices = admin || data.announcements.length > 0;
  if (!showFocus && !showNotices) return null;
  return (
    <section aria-label="This month" className={cn("mb-5 grid gap-3", showFocus && showNotices && "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]")}>
      {showFocus ? <FocusCard month={data.month} focus={data.productFocus} admin={admin} /> : null}
      {showNotices ? <AnnouncementsCard month={data.month} items={data.announcements} admin={admin} /> : null}
    </section>
  );
}

function FocusCard({ month, focus, admin }: { month: string; focus: string | null; admin: boolean }) {
  const router = useRouter();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(focus ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await safeAction(() => saveProductFocus(month, text));
      if (res.ok) { setEditing(false); setError(null); router.refresh(); return; }
      setError(("fieldErrors" in res && res.fieldErrors?.productFocus) || res.message);
    });
  }

  return (
    <Card className="flex min-w-0 flex-col gap-2 border-primary bg-primary text-primary-foreground shadow-none">
      <div className="flex items-center gap-1.5 text-compact text-primary-foreground/90">
        <Target aria-hidden="true" strokeWidth={1.75} className="size-3.5" />
        <span id={`${id}-label`}>Product focus</span>
        {admin && !editing && focus !== null ? (
          <Button variant="ghost" size="icon-sm" aria-label="Edit product focus" title="Edit product focus" onClick={() => { setText(focus); setEditing(true); }}
            className="ml-auto text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"><Pencil aria-hidden="true" strokeWidth={1.75} /></Button>
        ) : null}
      </div>
      {editing ? (
        <div className="rounded-lg bg-card p-3 text-card-foreground">
          <Label htmlFor={`${id}-text`} className="sr-only">Product focus</Label>
          <Textarea id={`${id}-text`} rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)}
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
          <FieldError id={`${id}-error`}>{error}</FieldError>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditing(false); setError(null); }}>Cancel</Button>
            <Button variant="default" size="sm" loading={pending} onClick={save}>Save</Button>
          </div>
        </div>
      ) : focus !== null ? (
        <p className="text-base leading-6 font-semibold whitespace-pre-line">{focus}</p>
      ) : (
        <Button variant="secondary" size="sm" className="self-start" icon={<Plus aria-hidden="true" strokeWidth={1.75} />} onClick={() => { setText(""); setEditing(true); }}>
          Set this month&apos;s product focus
        </Button>
      )}
    </Card>
  );
}

function AnnouncementsCard({ month, items, admin }: { month: string; items: CalAnnouncement[]; admin: boolean }) {
  const [dialog, setDialog] = useState<{ open: boolean; item: CalAnnouncement | null }>({ open: false, item: null });
  const [deleting, setDeleting] = useState<CalAnnouncement | null>(null);
  return (
    <Card className="min-w-0 shadow-none">
      <CardHeader className="mb-2">
        <CardTitle as="h2" className="flex items-center gap-1.5 text-compact font-medium text-muted-foreground">
          <Megaphone aria-hidden="true" strokeWidth={1.75} className="size-3.5" />Announcements
        </CardTitle>
        {admin && items.length > 0 ? (
          <CardAction><Button variant="ghost" size="sm" icon={<Plus aria-hidden="true" strokeWidth={1.75} />} onClick={() => setDialog({ open: true, item: null })}>Add</Button></CardAction>
        ) : null}
      </CardHeader>
      {items.length > 0 ? (
        <ul aria-label="Announcements" className="divide-y divide-border">
          {items.map((a) => (
            <li key={a.id} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
              <p className="min-w-0 flex-1 text-sm whitespace-pre-line text-foreground">{a.body}</p>
              {admin ? (
                <span className="flex shrink-0 gap-0.5">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit announcement: ${a.body}`} title="Edit" onClick={() => setDialog({ open: true, item: a })}>
                    <Pencil aria-hidden="true" strokeWidth={1.75} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete announcement: ${a.body}`} title="Delete" onClick={() => setDeleting(a)}>
                    <Trash2 aria-hidden="true" strokeWidth={1.75} />
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Button variant="outline" size="sm" icon={<Plus aria-hidden="true" strokeWidth={1.75} />} onClick={() => setDialog({ open: true, item: null })}>Add an announcement</Button>
      )}
      {admin ? (
        <>
          <AnnouncementDialog month={month} announcement={dialog.item} open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
          <DeleteAnnouncement item={deleting} onClose={() => setDeleting(null)} />
        </>
      ) : null}
    </Card>
  );
}

function DeleteAnnouncement({ item, onClose }: { item: CalAnnouncement | null; onClose: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function confirm(e: React.MouseEvent) {
    e.preventDefault();
    if (!item) return;
    start(async () => {
      const res = await safeAction(() => deleteAnnouncement(item.id));
      if (res.ok) { setMessage(null); onClose(); router.refresh(); } else setMessage(res.message);
    });
  }
  return (
    <AlertDialog open={item !== null} onOpenChange={(open) => { if (!open) { setMessage(null); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
          <AlertDialogDescription>Everyone stops seeing it on the Marketing Calendar.</AlertDialogDescription>
        </AlertDialogHeader>
        {message ? <Alert variant="destructive"><AlertDescription><p>{message}</p></AlertDescription></Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={confirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
