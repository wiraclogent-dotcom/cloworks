"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/shadcn/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/shadcn/alert-dialog";
import { cn } from "@/components/ui/cn";
import { deleteNote, deleteNoteNow, moveNote, restoreNote, saveNote, setNotePinned } from "@/app/(app)/notes/actions";
import { NOTE_EXTENSIONS } from "@/lib/notes/doc";
import { formatEdited } from "@/lib/notes/format";
import type { FolderRow, NoteDetail } from "@/lib/notes/notes";
import { NoteToolbar } from "./NoteToolbar";
import { useNoteAutosave, type SaveStatus } from "./useNoteAutosave";

type Saved = { title: string; preview: string; updatedAt: Date };

function statusText(s: SaveStatus): string {
  if (s.kind === "saved") return `Edited ${formatEdited(s.at)} · Saved`;
  if (s.kind === "saving") return "Saving…";
  if (s.kind === "retrying") return "Not saved. Retrying…";
  return s.message;
}

/**
 * One open note (spec 2026-10-23). The parent mounts it with `key={note.id}`. Edits autosave; closing the note
 * flushes the last edit, and a note left with no text is reported through `onLeaveEmpty` once that save is done (the
 * server checks the saved text before deleting it for good). A note in Recently Deleted is read-only with Restore and
 * Delete now. `onClose` is called after the note leaves the current view (deleted, restored, deleted for good).
 */
export function NoteEditor({ note, folders, readOnly, onSaved, onLeaveEmpty, onClose }: {
  note: NoteDetail;
  folders: FolderRow[];
  readOnly: boolean;
  onSaved: (id: string, r: Saved) => void;
  onLeaveEmpty: (id: string) => void;
  onClose: () => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const { status, change, flush } = useNoteAutosave(note.id, saveNote, onSaved, note.updatedAt);
  const empty = useRef(false);

  const editor = useEditor({
    extensions: [...NOTE_EXTENSIONS, Placeholder.configure({ placeholder: "Start writing…" })],
    content: note.body,
    editable: !readOnly,
    // A brand-new note is ready to type into, as in Apple Notes; opening an existing note leaves focus alone.
    autofocus: !readOnly && note.title === "" ? "end" : false,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "note-editor", role: "textbox", "aria-multiline": "true", "aria-label": "Note" },
      handleKeyDown: (_view, e) => {
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") { setLinkOpen(true); return true; }
        return false;
      },
    },
    onCreate: ({ editor: e }) => { empty.current = e.state.doc.textContent.trim() === ""; },
    onUpdate: ({ editor: e }) => {
      empty.current = e.state.doc.textContent.trim() === "";
      change(e.getJSON());
    },
  });

  // Closing the note (switching notes or leaving the page): save the last edit, then report an empty note.
  const leave = useRef({ flush, onLeaveEmpty, readOnly });
  useEffect(() => { leave.current = { flush, onLeaveEmpty, readOnly }; });
  useEffect(() => () => {
    const { flush: f, onLeaveEmpty: report, readOnly: ro } = leave.current;
    if (ro) return;
    const wasEmpty = empty.current;
    void f().then(() => { if (wasEmpty) report(note.id); });
  }, [note.id]);

  const act = (run: () => Promise<{ ok: boolean; message?: string }>, then?: () => void) => startBusy(async () => {
    setActionError(null);
    const r = await run();
    if (!r.ok) setActionError(r.message ?? "Something went wrong.");
    else then?.();
  });

  const shown = actionError ?? (readOnly && note.deletedAt ? `Deleted ${formatEdited(note.deletedAt)}` : statusText(status));
  const failed = actionError !== null || (!readOnly && status.kind === "failed");

  return (
    <section aria-label="Note" className="flex min-h-0 flex-1 flex-col">
      {readOnly ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
          <p className="mr-auto text-sm text-muted-foreground">This note is in Recently Deleted.</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => restoreNote(note.id), onClose)}>
            <RotateCcw aria-hidden="true" />Restore
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={busy}><Trash2 aria-hidden="true" />Delete now</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this note for good?</AlertDialogTitle>
                <AlertDialogDescription>It can&apos;t be restored afterwards.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => act(() => deleteNoteNow(note.id), onClose)}>Delete now</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : editor ? (
        <div className="border-b border-border pb-2">
          <NoteToolbar editor={editor} note={note} folders={folders} linkOpen={linkOpen} onLinkOpenChange={setLinkOpen}
            onPin={() => act(() => setNotePinned(note.id, !note.pinned))}
            onMove={(folderId) => act(() => moveNote(note.id, folderId))}
            onDelete={() => act(async () => { await flush(); return deleteNote(note.id); }, onClose)} />
        </div>
      ) : null}
      <p aria-live="polite" className={cn("pt-2 text-xs", failed ? "text-danger" : "text-muted-foreground")}>{shown}</p>
      <EditorContent editor={editor} className="min-h-0 flex-1 overflow-y-auto py-3" />
    </section>
  );
}
