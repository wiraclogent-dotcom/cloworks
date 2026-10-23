import { describe, it, expect } from "vitest";
import { FIELD_KEY_RE, type FieldSchema } from "@/lib/fieldSchema";
import { fieldKeyFor, finalizeSchema, rowsFromSchema, type FieldRow } from "@/lib/fieldSchemaEdit";

// Social Media's schema as stored in production (spec 2026-10-23).
const SOCIAL: FieldSchema = [
  { key: "platform", type: "select", label: "Platform", options: ["TikTok", "Instagram"], required: true },
  { key: "contentType", type: "select", label: "Content type", options: ["Campaign", "Daily", "Story", "Urgent"], required: true },
  { key: "shooting", type: "checkbox", label: "Shooting" },
  { key: "editing", type: "checkbox", label: "Editing" },
  { key: "upload", type: "checkbox", label: "Upload" },
  { key: "publishedUrl", type: "url", label: "Published link" },
];
const none = new Set<string>();
const row = (over: Partial<FieldRow>): FieldRow => ({ key: null, label: "X", type: "text", required: false, options: [], ...over });

describe("fieldKeyFor", () => {
  it("camel-cases the label's letters and digits", () => {
    expect(fieldKeyFor("Content type", none)).toBe("contentType");
    expect(fieldKeyFor("Published link", none)).toBe("publishedLink");
    expect(fieldKeyFor("  TikTok   handle! ", none)).toBe("tiktokHandle");
  });
  it("starts with 'field' when the label is empty of letters or starts with a digit", () => {
    expect(fieldKeyFor("2nd draft", none)).toBe("field2ndDraft");
    expect(fieldKeyFor("🎬", none)).toBe("field");
    expect(fieldKeyFor("", none)).toBe("field");
  });
  it("adds 2, 3… while the key is taken, and always matches the key rule", () => {
    expect(fieldKeyFor("Platform", new Set(["platform"]))).toBe("platform2");
    expect(fieldKeyFor("Platform", new Set(["platform", "platform2"]))).toBe("platform3");
    const long = fieldKeyFor("word ".repeat(30), none);
    expect(long).toMatch(FIELD_KEY_RE);
    expect(fieldKeyFor("word ".repeat(30), new Set([long]))).toMatch(FIELD_KEY_RE);
  });
});

describe("finalizeSchema", () => {
  it("round-trips the Social Media schema unchanged", () => {
    expect(finalizeSchema(rowsFromSchema(SOCIAL))).toEqual({ ok: true, schema: SOCIAL });
  });
  it("keeps an existing field's key when its label changes", () => {
    const rows = rowsFromSchema(SOCIAL);
    rows[1] = { ...rows[1], label: "Kind of content" };
    const r = finalizeSchema(rows);
    expect(r.ok && r.schema[1]).toMatchObject({ key: "contentType", label: "Kind of content" });
  });
  it("gives new fields keys that don't clash with existing ones, and keeps the order", () => {
    const rows = [row({ label: "Platform", key: null }), ...rowsFromSchema(SOCIAL)];
    const r = finalizeSchema([...rows.slice(1), { ...rows[0], label: "Platform note" }, row({ label: "Platform", key: null })]);
    expect(r.ok).toBe(false); // "Platform" is used twice
    const ok = finalizeSchema([...rowsFromSchema(SOCIAL), row({ label: "Platform note" })]);
    expect(ok.ok && ok.schema.map((f) => f.key)).toEqual(["platform", "contentType", "shooting", "editing", "upload", "publishedUrl", "platformNote"]);
  });
  it("re-adding a removed field's label brings its key back", () => {
    const rows = rowsFromSchema(SOCIAL).filter((r) => r.key !== "contentType");
    const r = finalizeSchema([...rows, row({ label: "Content type", type: "select", options: ["Daily"] })]);
    expect(r.ok && r.schema.at(-1)?.key).toBe("contentType");
  });
  it("reports label and choice problems per row", () => {
    const r = finalizeSchema([
      row({ label: "  " }),
      row({ label: "Notes" }),
      row({ label: "notes " }),
      row({ label: "Size", type: "select", options: [] }),
      row({ label: "Colour", type: "select", options: ["Red", " red"] }),
    ]);
    expect(r).toEqual({ ok: false, errors: {
      0: "Label is required",
      2: "Another field already uses this label",
      3: "Add at least one choice",
      4: "Choices must be different",
    } });
  });
  it("trims labels and choices, drops choices off Choice lists and Required off Checkboxes", () => {
    const r = finalizeSchema([
      row({ label: " Size ", type: "select", options: [" S ", "M", " "], required: true }),
      row({ label: "Agree", type: "checkbox", required: true, options: ["x"] }),
      row({ label: "Link", type: "url", options: ["y"] }),
    ]);
    expect(r).toEqual({ ok: true, schema: [
      { key: "size", label: "Size", type: "select", options: ["S", "M"], required: true },
      { key: "agree", label: "Agree", type: "checkbox" },
      { key: "link", label: "Link", type: "url" },
    ] });
  });
});
