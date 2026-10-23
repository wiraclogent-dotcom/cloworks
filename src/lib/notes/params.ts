import type { NoteView } from "./notes";

/** The Notes page's URL state: `?view=<all|deleted|folderId>&note=<id>&q=<text>&pane=folders` (pane: phones only). */
export type NotesParams = { view: NoteView; noteId: string | null; q: string; pane: "folders" | null };

const Q_MAX = 100;
type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Unknown or someone else's folder ids fall back to All Notes (a stale link never errors). */
export function parseNotesParams(sp: RawParams, folderIds: readonly string[]): NotesParams {
  const view = first(sp.view);
  return {
    view: view === "deleted" || (view !== undefined && folderIds.includes(view)) ? view : "all",
    noteId: first(sp.note) || null,
    q: (first(sp.q) ?? "").trim().slice(0, Q_MAX),
    pane: first(sp.pane) === "folders" ? "folders" : null,
  };
}

/** `/notes` plus only the params that differ from the defaults. */
export function notesHref({ view = "all", noteId = null, q = "", pane = null }: Partial<NotesParams>): string {
  const sp = new URLSearchParams();
  if (view !== "all") sp.set("view", view);
  if (noteId) sp.set("note", noteId);
  if (q) sp.set("q", q);
  if (pane) sp.set("pane", pane);
  const s = sp.toString();
  return s ? `/notes?${s}` : "/notes";
}
