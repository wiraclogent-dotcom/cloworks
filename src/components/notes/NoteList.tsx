"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search, SquarePen, Trash2 } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { NativeSelect } from "@/components/shadcn/native-select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/shadcn/alert-dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, focusRing } from "@/components/ui/cn";
import { createNote, emptyDeleted } from "@/app/(app)/notes/actions";
import { formatNoteTime } from "@/lib/notes/format";
import type { FolderRow, NoteRow } from "@/lib/notes/notes";
import { notesHref, type NotesParams } from "@/lib/notes/params";

const SEARCH_DELAY_MS = 300;

/** Search box: updates `?q=` 300 ms after typing stops (replace, so typing never fills the history). */
function SearchBox({ params, onNavigate }: { params: NotesParams; onNavigate: (href: string, replace?: boolean) => void }) {
  const [value, setValue] = useState(params.q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <label className="relative block">
      <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" aria-label="Search notes" placeholder="Search" value={value} className="pl-9"
        onChange={(e) => {
          const q = e.target.value;
          setValue(q);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onNavigate(notesHref({ ...params, q: q.trim() }), true), SEARCH_DELAY_MS);
        }} />
    </label>
  );
}

function Rows({ rows, params, now }: { rows: NoteRow[]; params: NotesParams; now: Date }) {
  return (
    <ul className="space-y-0.5">
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={notesHref({ ...params, noteId: r.id, pane: null })} aria-current={params.noteId === r.id ? "page" : undefined}
            className={cn("block rounded-lg px-3 py-2 hover:bg-muted aria-[current=page]:bg-accent", focusRing)}>
            <span className="block truncate text-sm font-semibold text-foreground">{r.title || "New note"}</span>
            <span className="flex min-w-0 gap-2 text-xs text-muted-foreground">
              <span className="flex-none tabular-nums">{formatNoteTime(r.updatedAt, now)}</span>
              <span className="truncate">{r.preview || "No additional text"}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * The note list of one view: search, New note (not in Recently Deleted), pinned notes first under their own heading,
 * then the rest by last edit. Recently Deleted lists by deletion and offers Empty. Between 768 and 1279px the folder
 * column is hidden, so a folder picker sits on top.
 */
export function NoteList({ notes, params, now, folders, onNavigate }: {
  notes: NoteRow[]; params: NotesParams; now: Date; folders: FolderRow[]; onNavigate: (href: string, replace?: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const deleted = params.view === "deleted";
  const pinned = deleted ? [] : notes.filter((n) => n.pinned);
  const rest = deleted ? notes : notes.filter((n) => !n.pinned);

  const newNote = () => start(async () => {
    setError(null);
    const r = await createNote(params.view === "all" ? null : params.view);
    if (!r.ok) return setError(r.message);
    onNavigate(notesHref({ view: params.view, noteId: r.id }));
  });

  return (
    <section aria-label="Notes list" className="flex min-h-0 flex-col gap-3">
      <NativeSelect aria-label="Folder" className="hidden md:block xl:hidden" value={params.view}
        onChange={(e) => onNavigate(notesHref({ view: e.target.value }))}>
        <option value="all">All Notes</option>
        {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        <option value="deleted">Recently Deleted</option>
      </NativeSelect>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><SearchBox key={params.view} params={params} onNavigate={onNavigate} /></div>
        {deleted ? (
          notes.length > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={pending}><Trash2 aria-hidden="true" />Empty</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Empty Recently Deleted?</AlertDialogTitle>
                  <AlertDialogDescription>All notes here are deleted for good. This can&apos;t be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => start(async () => {
                    setError(null);
                    const r = await emptyDeleted();
                    if (!r.ok) return setError(r.message);
                    if (params.noteId) onNavigate(notesHref({ view: "deleted" }));
                  })}>Empty</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null
        ) : (
          <Button variant="default" size="sm" disabled={pending} onClick={newNote}><SquarePen aria-hidden="true" />New note</Button>
        )}
      </div>
      {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
      {deleted && notes.length > 0 ? <p className="text-xs text-muted-foreground">Notes here are deleted for good after 30 days.</p> : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {notes.length === 0 ? (
          <EmptyState size="inline" title={params.q ? `No notes match “${params.q}”` : deleted ? "Recently Deleted is empty" : "No notes yet"} />
        ) : pinned.length > 0 ? (
          <div className="space-y-3">
            <div>
              <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">Pinned</h2>
              <Rows rows={pinned} params={params} now={now} />
            </div>
            {rest.length > 0 ? (
              <div>
                <h2 className="px-3 pb-1 text-xs font-medium text-muted-foreground">Notes</h2>
                <Rows rows={rest} params={params} now={now} />
              </div>
            ) : null}
          </div>
        ) : (
          <Rows rows={rest} params={params} now={now} />
        )}
      </div>
    </section>
  );
}
