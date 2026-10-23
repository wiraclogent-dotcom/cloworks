// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen, cleanup, act, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";

vi.mock("@/app/(app)/notes/actions", () => ({
  saveNote: vi.fn(), setNotePinned: vi.fn(), moveNote: vi.fn(), deleteNote: vi.fn(), restoreNote: vi.fn(), deleteNoteNow: vi.fn(),
}));

import { saveNote } from "@/app/(app)/notes/actions";
import { useNoteAutosave } from "@/components/notes/useNoteAutosave";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { parseNoteDoc } from "@/lib/notes/doc";
import type { NoteDetail } from "@/lib/notes/notes";

const AT = new Date("2026-10-23T02:41:00Z");
const ok = (title = "T") => ({ ok: true as const, title, preview: "", updatedAt: AT });
const b = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

class RO { observe() {} unobserve() {} disconnect() {} }
beforeEach(() => {
  globalThis.ResizeObserver = RO as unknown as typeof ResizeObserver;
  document.elementFromPoint = () => null;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  vi.mocked(saveNote).mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("useNoteAutosave", () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it("saves once, 1 s after typing stops", async () => {
    const save = vi.fn(async () => ok());
    const onSaved = vi.fn();
    const { result } = renderHook(() => useNoteAutosave("A", save, onSaved, new Date(0)));
    act(() => result.current.change(b("1")));
    await advance(300);
    act(() => result.current.change(b("12")));
    await advance(200);
    act(() => result.current.change(b("123")));
    await advance(999);
    expect(save).not.toHaveBeenCalled();
    await advance(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("A", b("123"));
    expect(result.current.status).toEqual({ kind: "saved", at: AT });
    expect(onSaved).toHaveBeenCalledWith("A", { title: "T", preview: "", updatedAt: AT });
  });

  it("a change made while saving is saved right after", async () => {
    let release!: (v: ReturnType<typeof ok>) => void;
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { release = r; }))
      .mockImplementation(async () => ok());
    const { result } = renderHook(() => useNoteAutosave("A", save, vi.fn(), new Date(0)));
    act(() => result.current.change(b("1")));
    await advance(1000);
    expect(result.current.status).toEqual({ kind: "saving" });
    act(() => result.current.change(b("2")));
    await advance(1000);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => release(ok()));
    await advance(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("A", b("2"));
  });

  it("retries a failed save after 2 and 5 s and shows Retrying", async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockImplementation(async () => ok());
    const { result } = renderHook(() => useNoteAutosave("A", save, vi.fn(), new Date(0)));
    act(() => result.current.change(b("1")));
    await advance(1000);
    expect(result.current.status).toEqual({ kind: "retrying" });
    await advance(1999);
    expect(save).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(save).toHaveBeenCalledTimes(2);
    await advance(4999);
    expect(save).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(save).toHaveBeenCalledTimes(3);
    expect(save).toHaveBeenLastCalledWith("A", b("1"));
    expect(result.current.status).toEqual({ kind: "saved", at: AT });
  });

  it("stops on a session end and shows the message", async () => {
    const message = "Your session ended. Sign in again.";
    const save = vi.fn(async () => ({ ok: false as const, code: "UNAUTHENTICATED" as const, message }));
    const { result } = renderHook(() => useNoteAutosave("A", save, vi.fn(), new Date(0)));
    act(() => result.current.change(b("1")));
    await advance(1000);
    expect(result.current.status).toEqual({ kind: "failed", message });
    await advance(60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("too large shows the reason and does not retry, but a later edit tries again", async () => {
    const message = "This note is too long to save.";
    const save = vi.fn()
      .mockImplementationOnce(async () => ({ ok: false, code: "TOO_LARGE", message }))
      .mockImplementation(async () => ok());
    const { result } = renderHook(() => useNoteAutosave("A", save, vi.fn(), new Date(0)));
    act(() => result.current.change(b("huge")));
    await advance(1000);
    expect(result.current.status).toEqual({ kind: "failed", message });
    await advance(60_000);
    expect(save).toHaveBeenCalledTimes(1);
    act(() => result.current.change(b("short")));
    await advance(1000);
    expect(save).toHaveBeenLastCalledWith("A", b("short"));
    expect(result.current.status).toEqual({ kind: "saved", at: AT });
  });

  it("warns before leaving the page while an edit is unsaved", async () => {
    const save = vi.fn(async () => ok());
    const { result } = renderHook(() => useNoteAutosave("A", save, vi.fn(), new Date(0)));
    const leave = () => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(leave()).toBe(false);
    act(() => result.current.change(b("1")));
    expect(leave()).toBe(true);
    await advance(1000);
    expect(leave()).toBe(false);
  });
});

const note = (id: string, body: object = b("x"), extra: Partial<NoteDetail> = {}): NoteDetail =>
  ({ id, body, title: "x", pinned: false, folderId: null, deletedAt: null, updatedAt: AT, ...extra });
const editorOf = async () => {
  await waitFor(() => expect(document.querySelector(".ProseMirror")).toBeTruthy());
  return (document.querySelector(".ProseMirror") as unknown as { editor: Editor }).editor;
};
const props = { folders: [], readOnly: false, onSaved: () => {}, onLeaveEmpty: () => {}, onClose: () => {} };

describe("NoteEditor", () => {
  it("toolbar toggles reflect the selection's marks", async () => {
    render(<NoteEditor {...props} note={note("A", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "tebal", marks: [{ type: "bold" }] }] }] })} />);
    const editor = await editorOf();
    act(() => { editor.commands.selectAll(); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByRole("button", { name: "Italic" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeTruthy();
  });

  it("switching notes flushes the pending edit to the note it belongs to", async () => {
    vi.mocked(saveNote).mockImplementation(async () => ok());
    const { rerender } = render(<NoteEditor key="A" {...props} note={note("A")} />);
    const editor = await editorOf();
    act(() => { editor.commands.setContent(b("for A"), { emitUpdate: true }); });
    rerender(<NoteEditor key="B" {...props} note={note("B", b("B text"))} />);
    await waitFor(() => expect(saveNote).toHaveBeenCalledWith("A", b("for A")));
    expect(vi.mocked(saveNote).mock.calls.every(([id]) => id === "A")).toBe(true);
  });

  it("leaving an emptied note saves first, then reports it empty", async () => {
    const order: string[] = [];
    vi.mocked(saveNote).mockImplementation(async (id) => { order.push(`save ${id}`); return ok(""); });
    const { unmount } = render(<NoteEditor {...props} note={note("A")} onLeaveEmpty={(id) => order.push(`empty ${id}`)} />);
    const editor = await editorOf();
    act(() => { editor.commands.clearContent(true); });
    unmount();
    await waitFor(() => expect(order).toEqual(["save A", "empty A"]));
  });

  it("pasted rich HTML keeps only supported formatting and still validates", async () => {
    render(<NoteEditor {...props} note={note("A", { type: "doc", content: [{ type: "paragraph" }] })} />);
    const editor = await editorOf();
    act(() => {
      editor.commands.insertContent('<h1>T</h1><p style="color:red">a <img src="x"> <b>b</b> <span style="color:red">c</span></p><table><tr><td>d</td></tr></table><h5>e</h5>');
    });
    const json = editor.getJSON();
    expect(() => parseNoteDoc(json)).not.toThrow();
    expect(JSON.stringify(json)).not.toMatch(/"image"|"table"|textStyle/);
    expect(editor.getText()).toContain("d");
  });

  it("a new empty note opens with the cursor in it; an existing note does not grab focus", async () => {
    render(<NoteEditor {...props} note={note("A", { type: "doc", content: [{ type: "paragraph" }] }, { title: "" })} />);
    const editor = await editorOf();
    await waitFor(() => expect(editor.isFocused).toBe(true));
    cleanup();
    render(<NoteEditor {...props} note={note("B", b("ada isi"))} />);
    const other = await editorOf();
    await new Promise((r) => setTimeout(r, 50));
    expect(other.isFocused).toBe(false);
  });

  it("a Recently Deleted note is read-only with Restore and Delete now", async () => {
    render(<NoteEditor {...props} readOnly note={note("A", b("old"), { deletedAt: AT })} />);
    await editorOf();
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(document.querySelector(".ProseMirror")!.getAttribute("contenteditable")).toBe("false");
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete now" })).toBeTruthy();
  });
});
