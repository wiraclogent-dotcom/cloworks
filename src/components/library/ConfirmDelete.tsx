"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteItem } from "@/app/(app)/library/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Button } from "@/components/shadcn/button";

export function ConfirmDelete({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setPending(true);
    setError(null);
    let r;
    try { r = await deleteItem(id); }
    catch { setError("Something went wrong. Try again."); return; }
    finally { setPending(false); }
    if (!r.ok) { setError(r.message); return; }
    router.refresh();
    onClose();
  }
  // An alertdialog: a click outside does not cancel it (only Cancel or Esc do). Delete is a plain Button, not
  // AlertDialogAction, so a failed delete leaves the dialog open with the error instead of closing it.
  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete "${title}"?`}</AlertDialogTitle>
          <AlertDialogDescription>This removes the link for everyone in the workspace.</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
          <Button variant="destructive" loading={pending} onClick={confirm}>Delete</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
