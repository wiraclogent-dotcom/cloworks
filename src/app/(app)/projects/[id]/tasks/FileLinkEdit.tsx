"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { setTaskFileUrl } from "./actions";

/** File cell for one variant: the link (or plain name), with an inline editor that saves on submit. */
export function FileLinkEdit({ projectId, taskId, fileUrl, text, label }: { projectId: string; taskId: string; fileUrl: string | null; text: string; label: string }) {
  const [url, setUrl] = useState<string | null>(fileUrl);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fileUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await setTaskFileUrl(projectId, taskId, draft);
      if (r.ok) {
        setUrl(r.fileUrl);
        setDraft(r.fileUrl ?? "");
        setEditing(false);
      } else {
        setError(r.message);
      }
    });
  }

  if (editing) {
    return (
      <form onSubmit={save} className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <Input
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://"
            aria-label={`File link for ${label}`}
            className="h-8 min-w-56"
            disabled={pending}
            autoFocus
          />
          <Button type="submit" size="sm" disabled={pending}>Save</Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setDraft(url ?? ""); setError(null); setEditing(false); }}>Cancel</Button>
        </div>
        <p className="text-xs text-foreground-secondary">Leave empty to remove the link.</p>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="icon" variant="ghost" className="size-7 shrink-0" title={url ? "Edit file link" : "Add file link"}
        aria-label={`${url ? "Edit" : "Add"} file link for ${label}`} onClick={() => { setDraft(url ?? ""); setError(null); setEditing(true); }}>
        {url ? <Pencil aria-hidden="true" className="size-3.5" /> : <Plus aria-hidden="true" className="size-3.5" />}
      </Button>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-link underline-offset-2 hover:underline">{text}</a>
      ) : (
        <span className="text-foreground-secondary">{text}</span>
      )}
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </div>
  );
}
