import { getSchema, type Extensions, type JSONContent } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { NoteError } from "./errors";

export const NOTE_MAX_BYTES = 500_000;
export const NOTE_TITLE_MAX = 200;
export const NOTE_PREVIEW_MAX = 120;
const HEADING_LEVELS = [1, 2, 3] as const;

export const EMPTY_NOTE_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/** Links may only point to the web or an email address. */
export function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href.trim());
}

/**
 * The note schema, shared by the editor and the server (spec 2026-10-23): Title / Heading / Subheading (h1–h3),
 * bold, italic, underline, strike, bullet / numbered / check lists, links. Code, quotes and rules are off.
 */
export const NOTE_EXTENSIONS: Extensions = [
  StarterKit.configure({
    heading: { levels: [...HEADING_LEVELS] },
    code: false,
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
      isAllowedUri: (url) => isSafeHref(url),
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
];

const schema = getSchema(NOTE_EXTENSIONS);
const invalid = () => new NoteError("INVALID", "This note could not be saved.");

/** Parses and checks a document against the note schema; throws NoteError("INVALID" | "TOO_LARGE") otherwise. */
export function parseNoteDoc(json: unknown): PMNode {
  if (typeof json !== "object" || json === null) throw invalid();
  if (JSON.stringify(json).length > NOTE_MAX_BYTES) throw new NoteError("TOO_LARGE", "This note is too long to save.");
  let doc: PMNode;
  try {
    doc = schema.nodeFromJSON(json);
    doc.check();
  } catch {
    throw invalid();
  }
  if (doc.type.name !== "doc") throw invalid();
  doc.descendants((node) => {
    if (node.type.name === "heading" && !(HEADING_LEVELS as readonly number[]).includes(node.attrs.level)) throw invalid();
    for (const m of node.marks) if (m.type.name === "link" && !isSafeHref(String(m.attrs.href ?? ""))) throw invalid();
  });
  return doc;
}

/** Title (first non-empty line, trimmed, ≤ 200 chars) and plain text (blocks and line breaks joined by "\n"). */
export function noteSummary(doc: PMNode): { title: string; text: string } {
  const text = doc.textBetween(0, doc.content.size, "\n", "\n");
  const first = text.split("\n").find((l) => l.trim() !== "") ?? "";
  return { title: first.trim().slice(0, NOTE_TITLE_MAX), text };
}

/** The list preview: the text after the title line, whitespace collapsed, ≤ 120 chars. */
export function notePreview(text: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.trim() !== "");
  if (at === -1) return "";
  return lines.slice(at + 1).join(" ").replace(/\s+/g, " ").trim().slice(0, NOTE_PREVIEW_MAX);
}
