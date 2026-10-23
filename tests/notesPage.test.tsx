// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent, waitFor, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace, refresh: vi.fn() }) }));
vi.mock("@/app/(app)/notes/actions", () => ({
  saveNote: vi.fn(), setNotePinned: vi.fn(), moveNote: vi.fn(), deleteNote: vi.fn(), restoreNote: vi.fn(), deleteNoteNow: vi.fn(),
  createNote: vi.fn(), emptyDeleted: vi.fn(), createFolder: vi.fn(), renameFolder: vi.fn(), deleteFolder: vi.fn(),
}));

import { createNote, deleteFolder, saveNote } from "@/app/(app)/notes/actions";
import { NotesView } from "@/components/notes/NotesView";
import type { NoteDetail, NoteRow, NotesSidebar } from "@/lib/notes/notes";
import type { NotesParams } from "@/lib/notes/params";

const NOW = new Date("2026-10-23T05:00:00Z");
const row = (id: string, title: string, extra: Partial<NoteRow> = {}): NoteRow =>
  ({ id, title, preview: `${title} body`, updatedAt: NOW, deletedAt: null, pinned: false, folderName: null, ...extra });
const sidebar: NotesSidebar = { folders: [{ id: "f1", name: "Meeting", count: 2 }, { id: "f2", name: "Pribadi", count: 0 }], allCount: 3, deletedCount: 1 };
const params = (p: Partial<NotesParams> = {}): NotesParams => ({ view: "all", noteId: null, q: "", pane: null, ...p });
const view = (over: Partial<Parameters<typeof NotesView>[0]> = {}) =>
  render(<NotesView sidebar={sidebar} notes={[row("n1", "Rapat"), row("n2", "Belanja")]} note={null} params={params()} now={NOW} {...over} />);

class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  document.elementFromPoint = () => null;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  push.mockReset(); replace.mockReset();
});
afterEach(cleanup);

describe("NotesView", () => {
  it("shows pinned notes first under their own heading", () => {
    view({ notes: [row("p1", "Penting", { pinned: true }), row("n1", "Rapat")] });
    const list = screen.getByRole("region", { name: "Notes list" });
    expect(within(list).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Pinned", "Notes"]);
    expect(within(list).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/notes?note=p1", "/notes?note=n1"]);
  });

  it("opening a note links to ?note= and keeps the view and search", () => {
    view({ params: params({ view: "f1", q: "kpi", noteId: "n2" }) });
    const link = screen.getByRole("link", { name: /Rapat/ });
    expect(link.getAttribute("href")).toBe("/notes?view=f1&note=n1&q=kpi");
    expect(screen.getByRole("link", { name: /Belanja/ }).getAttribute("aria-current")).toBe("page");
  });

  it("the folder list marks the open view and shows counts", () => {
    view({ params: params({ view: "f1" }) });
    const folders = screen.getByRole("navigation", { name: "Folders" });
    const current = within(folders).getByRole("link", { name: /Meeting/ });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.textContent).toContain("2");
    expect(within(folders).getByRole("link", { name: /Recently Deleted/ }).getAttribute("href")).toBe("/notes?view=deleted");
  });

  it("New note creates in the open folder and opens it", async () => {
    vi.mocked(createNote).mockResolvedValue({ ok: true, id: "new1" });
    view({ params: params({ view: "f1" }) });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "New note" })); });
    expect(createNote).toHaveBeenCalledWith("f1");
    expect(push).toHaveBeenCalledWith("/notes?view=f1&note=new1");
  });

  it("Recently Deleted has no New note button and offers Empty", () => {
    view({ notes: [row("d1", "Lama", { deletedAt: NOW })], params: params({ view: "deleted" }) });
    expect(screen.queryByRole("button", { name: "New note" })).toBeNull();
    expect(screen.getByRole("button", { name: "Empty" })).toBeTruthy();
  });

  it("deleting a folder asks first and names the note count", async () => {
    vi.mocked(deleteFolder).mockResolvedValue({ ok: true });
    view({ params: params({ view: "f1" }) });
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for Meeting" }), { key: "Enter" });
    await act(async () => { fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" })); });
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Delete folder “Meeting”?");
    expect(dialog.textContent).toContain("Its 2 notes move to Recently Deleted for 30 days.");
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Delete folder" })); });
    expect(deleteFolder).toHaveBeenCalledWith("f1");
    expect(push).toHaveBeenCalledWith("/notes");
  });

  // An auto grid column grows to its content's min width (the search row, long previews): on a 375px phone the page
  // scrolled sideways. The single phone column must be allowed to shrink.
  it("on phones the layout is one column that can shrink to the screen", () => {
    const { container } = view();
    expect((container.firstElementChild as HTMLElement).className.split(/\s+/)).toContain("grid-cols-[minmax(0,1fr)]");
  });

  it("with no note open, the editor area says so", () => {
    view();
    expect(screen.getByText("No note selected")).toBeTruthy();
  });

  it("a stale ?note= shows No note selected and the list", () => {
    view({ params: params({ noteId: "gone" }) });
    expect(screen.getByText("No note selected")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Rapat/ })).toBeTruthy();
  });

  it("a search with no hits says so", () => {
    view({ notes: [], params: params({ q: "zzz" }) });
    expect(screen.getByText("No notes match “zzz”")).toBeTruthy();
  });

  it("a saved title updates its row and moves it to the top of its group without a reload", async () => {
    vi.mocked(saveNote).mockResolvedValue({ ok: true, title: "Belanja bulanan", preview: "beras", updatedAt: NOW });
    const n2: NoteDetail = { id: "n2", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Belanja" }] }] }, title: "Belanja", pinned: false, folderId: null, deletedAt: null, updatedAt: NOW };
    view({ note: n2, params: params({ noteId: "n2" }) });
    await waitFor(() => expect(document.querySelector(".ProseMirror")).toBeTruthy());
    const editor = (document.querySelector(".ProseMirror") as unknown as { editor: Editor }).editor;
    act(() => { editor.commands.insertContent(" bulanan"); });
    const list = screen.getByRole("region", { name: "Notes list" });
    await waitFor(() => expect(within(list).getAllByRole("link")[0].textContent).toContain("Belanja bulanan"), { timeout: 3000 });
    expect(within(list).getAllByRole("link")[0].textContent).toContain("beras");
  });
});
