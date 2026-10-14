"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteItem } from "@/app/(app)/library/actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { LibraryDialog } from "./LibraryDialog";

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
  return (
    <LibraryDialog title={`Delete "${title}"?`} onClose={onClose}>
      <p className="mb-4 text-sm text-muted-foreground">This removes the link for everyone in the workspace.</p>
      {error ? <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="destructive" loading={pending} onClick={confirm}>Delete</Button>
      </div>
    </LibraryDialog>
  );
}
