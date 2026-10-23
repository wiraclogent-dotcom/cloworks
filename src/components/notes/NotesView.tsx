"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, StickyNote } from "lucide-react";
import { Card } from "@/components/shadcn/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, focusRing } from "@/components/ui/cn";
import { deleteNote } from "@/app/(app)/notes/actions";
import type { NoteDetail, NoteRow, NotesSidebar } from "@/lib/notes/notes";
import { notesHref, type NotesParams } from "@/lib/notes/params";
import { FolderList } from "./FolderList";
import { NoteList } from "./NoteList";
import { NoteEditor } from "./NoteEditor";

const backClass = cn("inline-flex items-center gap-1 rounded-md text-sm font-medium text-link md:hidden", focusRing);

/** Moves the saved note's row to the top of its group (pinned notes stay first) with its new title and preview. */
function withSaved(rows: NoteRow[], id: string, r: { title: string; preview: string; updatedAt: Date }): NoteRow[] {
  const old = rows.find((x) => x.id === id);
  if (!old) return rows;
  const row = { ...old, ...r };
  const others = rows.filter((x) => x.id !== id);
  const at = row.pinned ? 0 : others.findIndex((x) => !x.pinned);
  return at === -1 ? [...others, row] : [...others.slice(0, at), row, ...others.slice(at)];
}

/**
 * The Notes page body (spec 2026-10-23): folders | note list | editor from 1280px, list | editor (with a folder
 * picker) from 768px, and one pane at a time on phones (the URL decides which). Saving a note updates its list row in
 * place; the lists otherwise come fresh from the server after each action.
 */
export function NotesView({ sidebar, notes, note, params, now }: {
  sidebar: NotesSidebar; notes: NoteRow[]; note: NoteDetail | null; params: NotesParams; now: Date;
}) {
  const router = useRouter();
  // Local copy of the list for saves; a new list from the server (after any action or navigation) replaces it.
  const [local, setLocal] = useState({ source: notes, rows: notes });
  const rows = local.source === notes ? local.rows : notes;
  const navigate = (href: string, replace = false) => (replace ? router.replace(href) : router.push(href));

  const pane = note ? "editor" : params.pane === "folders" ? "folders" : "list";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:h-[calc(100dvh-12rem)] md:min-h-[32rem] md:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[13rem_19rem_minmax(0,1fr)]">
      <Card asChild className={cn("min-h-0 overflow-y-auto p-2", pane === "folders" ? "block md:hidden" : "hidden", "xl:block")}>
        <aside aria-label="Notes folders">
          <FolderList sidebar={sidebar} view={params.view} onNavigate={navigate} />
        </aside>
      </Card>

      <Card className={cn("min-h-0 flex-col gap-2 p-3", pane === "list" ? "flex" : "hidden", "md:flex")}>
        <Link href={notesHref({ ...params, noteId: null, pane: "folders" })} className={backClass}>
          <ChevronLeft aria-hidden="true" className="size-4" />Folders
        </Link>
        <NoteList notes={rows} params={params} now={now} folders={sidebar.folders} onNavigate={navigate} />
      </Card>

      <Card className={cn("min-h-[60vh] min-w-0 flex-col p-4 md:min-h-0", pane === "editor" ? "flex" : "hidden", "md:flex")}>
        {note ? (
          <>
            <Link href={notesHref({ ...params, noteId: null })} className={cn(backClass, "mb-2 self-start")}>
              <ChevronLeft aria-hidden="true" className="size-4" />Notes
            </Link>
            <NoteEditor key={note.id} note={note} folders={sidebar.folders} readOnly={note.deletedAt !== null}
              onSaved={(id, r) => setLocal({ source: notes, rows: withSaved(rows, id, r) })}
              onLeaveEmpty={(id) => void deleteNote(id)}
              onClose={() => navigate(notesHref({ ...params, noteId: null }))} />
          </>
        ) : (
          <EmptyState icon={<StickyNote aria-hidden="true" />} title="No note selected" description="Choose a note or create a new one." className="m-auto" />
        )}
      </Card>
    </div>
  );
}
