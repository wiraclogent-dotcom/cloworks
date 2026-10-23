import type { Metadata } from "next";
import { Suspense } from "react";
import { requireScope } from "@/lib/session";
import { getNote, listFolders, listNotes, purgeExpiredNotes } from "@/lib/notes/notes";
import { parseNotesParams } from "@/lib/notes/params";
import { NotesView } from "@/components/notes/NotesView";
import { ProjectsSkeleton } from "@/components/PageSkeletons";
import { PageHeader } from "@/components/ui/PageHeader";

/** Tab title: "Notes · Clowork" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Notes" };

/** The signed-in person's own notes (spec 2026-10-23). Expired and left-behind empty notes are cleaned up on each visit. */
async function NotesContent({ searchParams }: { searchParams: PageProps<"/notes">["searchParams"] }) {
  const { user, db } = await requireScope();
  const now = new Date();
  const sp = await searchParams;
  await purgeExpiredNotes(db, user.id, now);
  const sidebar = await listFolders(db, user.id);
  const params = parseNotesParams(sp, sidebar.folders.map((f) => f.id));
  const [notes, note] = await Promise.all([
    listNotes(db, user.id, { view: params.view, q: params.q }),
    params.noteId ? getNote(db, user.id, params.noteId) : null,
  ]);
  return (
    <>
      <PageHeader breadcrumb={[{ label: "Tools" }, { label: "Notes" }]} title="Notes" description="Only you can see your notes." />
      <NotesView sidebar={sidebar} notes={notes} note={note} params={params} now={now} />
    </>
  );
}

export default function NotesPage(props: PageProps<"/notes">) {
  return (
    <div>
      <Suspense fallback={<ProjectsSkeleton />}>
        <NotesContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
