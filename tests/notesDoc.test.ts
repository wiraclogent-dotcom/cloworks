import { describe, it, expect } from "vitest";
import { NoteError } from "@/lib/notes/errors";
import { EMPTY_NOTE_DOC, isSafeHref, noteSummary, notePreview, parseNoteDoc } from "@/lib/notes/doc";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const p = (t?: string) => ({ type: "paragraph", ...(t ? { content: [{ type: "text", text: t }] } : {}) });
const code = (f: () => unknown) => {
  try { f(); return "ok"; } catch (e) { return e instanceof NoteError ? e.code : `other:${e}`; }
};

describe("note documents", () => {
  it("accepts every supported block and mark", () => {
    const d = doc(
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Rapat", marks: [{ type: "bold" }] }] },
      { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Sub" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [p("a"), { type: "bulletList", content: [{ type: "listItem", content: [p("a.1")] }] }] }] },
      { type: "orderedList", content: [{ type: "listItem", content: [p("b")] }] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p("c")] }] },
      { type: "paragraph", content: [
        { type: "text", text: "x", marks: [{ type: "italic" }, { type: "underline" }, { type: "strike" }, { type: "link", attrs: { href: "https://clowork.my.id" } }] },
        { type: "hardBreak" },
        { type: "text", text: "mail", marks: [{ type: "link", attrs: { href: "mailto:a@b.co" } }] },
      ] },
    );
    expect(code(() => parseNoteDoc(d))).toBe("ok");
  });

  it("rejects unknown nodes, unknown marks, bad links and huge bodies", () => {
    expect(code(() => parseNoteDoc(doc({ type: "image", attrs: { src: "x" } })))).toBe("INVALID");
    expect(code(() => parseNoteDoc(doc({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "textStyle" }] }] })))).toBe("INVALID");
    expect(code(() => parseNoteDoc(doc({ type: "codeBlock" })))).toBe("INVALID");
    expect(code(() => parseNoteDoc(doc({ type: "heading", attrs: { level: 4 }, content: [{ type: "text", text: "h4" }] })))).toBe("INVALID");
    expect(code(() => parseNoteDoc(doc({ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] })))).toBe("INVALID");
    expect(code(() => parseNoteDoc(doc(p("x".repeat(500_001)))))).toBe("TOO_LARGE");
    expect(code(() => parseNoteDoc("nope"))).toBe("INVALID");
    expect(code(() => parseNoteDoc(null))).toBe("INVALID");
  });

  it("allows only http, https and mailto links", () => {
    expect(["https://x.co", "http://x.co", " MAILTO:a@b.co", "HTTPS://X.CO"].map(isSafeHref)).toEqual([true, true, true, true]);
    expect(["javascript:alert(1)", "data:text/html,x", "ftp://x.co", "x.co", ""].map(isSafeHref)).toEqual([false, false, false, false, false]);
  });

  it("derives the title from the first non-empty line and keeps every line in the text", () => {
    const s = noteSummary(parseNoteDoc(doc(
      p(), p("   "),
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [p("  Beli kertas ")] }] },
      p("Detail"),
    )));
    expect(s.title).toBe("Beli kertas");
    expect(s.text.split("\n").filter(Boolean)).toEqual(["   ", "  Beli kertas ", "Detail"]);
    expect(noteSummary(parseNoteDoc(doc(p("y".repeat(250))))).title).toHaveLength(200);
    expect(noteSummary(parseNoteDoc(EMPTY_NOTE_DOC))).toEqual({ title: "", text: "" });
  });

  it("previews the text after the title line", () => {
    expect(notePreview("\nRapat\nAgenda:   KPI\n\nBudget")).toBe("Agenda: KPI Budget");
    expect(notePreview("Only title")).toBe("");
    expect(notePreview(`T\n${"z".repeat(300)}`)).toHaveLength(120);
  });
});
