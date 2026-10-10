"use client";

import { safeAction } from "@/lib/safeAction";
import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { fieldClass } from "@/components/ui/Field";
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
          <input
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://"
            aria-label={`File link for ${label}`}
            className={fieldClass({ size: "sm", className: "min-w-56" })}
            disabled={pending}
            autoFocus
          />
          <Button type="submit" size="sm" variant="primary" disabled={pending}>Save</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setDraft(url ?? ""); setError(null); setEditing(false); }}>Cancel</Button>
        </div>
        <p className="text-xs text-foreground-secondary">Leave empty to remove the link.</p>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <IconButton size="sm" className="size-7 [&_svg]:size-3.5" title={url ? "Edit file link" : "Add file link"}
        aria-label={`${url ? "Edit" : "Add"} file link for ${label}`} icon={url ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
        onClick={() => { setDraft(url ?? ""); setError(null); setEditing(true); }} />
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-link underline-offset-2 hover:underline">{text}</a>
      ) : (
        <span className="text-foreground-secondary">{text}</span>
      )}
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </div>
  );
}
