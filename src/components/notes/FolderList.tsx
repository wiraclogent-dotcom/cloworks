"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Ellipsis, Folder, FolderPlus, Notebook, Trash2 } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { cn, focusRing } from "@/components/ui/cn";
import { createFolder, deleteFolder, renameFolder } from "@/app/(app)/notes/actions";
import type { FolderRow, NotesSidebar, NoteView } from "@/lib/notes/notes";
import { notesHref } from "@/lib/notes/params";

const rowClass = cn(
  "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-sm text-foreground hover:bg-muted",
  "aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0",
  focusRing,
);

function deleteMessage(n: number) {
  if (n === 0) return "It has no notes.";
  return `Its ${n} ${n === 1 ? "note moves" : "notes move"} to Recently Deleted for 30 days.`;
}

/** Name input for a new or renamed folder: Enter saves, Esc cancels; the action's message shows under it. */
function FolderNameInput({ label, initial, onSave, onCancel }: {
  label: string; initial: string; onSave: (name: string) => Promise<string | null>; onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = `folder-name-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="px-1 py-1">
      <Input autoFocus aria-label={label} value={value} maxLength={60} disabled={pending}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { if (!pending && !error) onCancel(); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onCancel(); }
          if (e.key === "Enter") { e.preventDefault(); start(async () => setError(await onSave(value))); }
        }} />
      {error ? <p id={`${id}-error`} className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/**
 * Notes folders column: All Notes, the person's folders (A–Z, with live note counts and a Rename / Delete menu) and
 * Recently Deleted, plus New folder. Deleting a folder asks first and sends its notes to Recently Deleted.
 */
export function FolderList({ sidebar, view, onNavigate }: { sidebar: NotesSidebar; view: NoteView; onNavigate: (href: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<FolderRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const item = (href: string, current: boolean, icon: React.ReactNode, label: string, count: number) => (
    <Link href={href} aria-current={current ? "page" : undefined} className={rowClass}>
      {icon}<span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </Link>
  );

  return (
    <nav aria-label="Folders" className="flex min-h-0 flex-col gap-1">
      <ul className="space-y-0.5">
        <li>{item(notesHref({}), view === "all", <Notebook aria-hidden="true" />, "All Notes", sidebar.allCount)}</li>
        {sidebar.folders.map((f) => (
          <li key={f.id}>
            {renaming === f.id ? (
              <FolderNameInput label={`Rename ${f.name}`} initial={f.name} onCancel={() => setRenaming(null)}
                onSave={async (name) => {
                  const r = await renameFolder(f.id, name);
                  if (!r.ok) return r.message;
                  setRenaming(null);
                  return null;
                }} />
            ) : (
              <div className="group flex items-center gap-0.5">
                {item(notesHref({ view: f.id }), view === f.id, <Folder aria-hidden="true" />, f.name, f.count)}
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${f.name}`} title={`Actions for ${f.name}`}>
                      <Ellipsis aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onSelect={() => setRenaming(f.id)}>Rename</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(f)}><Trash2 aria-hidden="true" />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </li>
        ))}
        <li>{item(notesHref({ view: "deleted" }), view === "deleted", <Trash2 aria-hidden="true" />, "Recently Deleted", sidebar.deletedCount)}</li>
      </ul>

      {adding ? (
        <FolderNameInput label="New folder name" initial="" onCancel={() => setAdding(false)}
          onSave={async (name) => {
            const r = await createFolder(name);
            if (!r.ok) return r.message;
            setAdding(false);
            onNavigate(notesHref({ view: r.id }));
            return null;
          }} />
      ) : (
        <Button variant="ghost" size="sm" className="justify-start" onClick={() => setAdding(true)}>
          <FolderPlus aria-hidden="true" />New folder
        </Button>
      )}
      {error ? <p role="alert" className="px-2.5 text-xs text-danger">{error}</p> : null}

      <AlertDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>{deleteMessage(deleting?.count ?? 0)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => {
              const f = deleting!;
              start(async () => {
                setError(null);
                const r = await deleteFolder(f.id);
                if (!r.ok) return setError(r.message);
                if (view === f.id) onNavigate(notesHref({}));
              });
            }}>Delete folder</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
