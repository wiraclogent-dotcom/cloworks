"use client";

import { safeAction } from "@/lib/safeAction";
import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { FileLocationLink } from "@/components/ui/FileLocationLink";
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
      const r = await safeAction(() => setTaskFileUrl(projectId, taskId, draft));
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
            type="text"
            inputMode="url"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://… or \\server\folder"
            aria-label={`File link for ${label}`}
            className="min-w-56" size="sm"
            disabled={pending}
            autoFocus
          />
          <Button type="submit" size="sm" variant="default" disabled={pending}>Save</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setDraft(url ?? ""); setError(null); setEditing(false); }}>Cancel</Button>
        </div>
        <p className="text-xs text-muted-foreground">Leave empty to remove the link.</p>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-7 [&_svg]:size-3.5"
        title={url ? "Edit file link" : "Add file link"}
        aria-label={`${url ? "Edit" : "Add"} file link for ${label}`}
        onClick={() => { setDraft(url ?? ""); setError(null); setEditing(true); }}
      >
        {url ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
      </Button>
      {url ? (
        <FileLocationLink href={url} name={text} className="text-link underline-offset-2 hover:underline">{text}</FileLocationLink>
      ) : (
        <span className="text-muted-foreground">{text}</span>
      )}
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </div>
  );
}
