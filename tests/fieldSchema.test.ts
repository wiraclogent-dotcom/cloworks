import { describe, it, expect } from "vitest";
import { validateFields, type FieldSchema } from "@/lib/fieldSchema";

const schema: FieldSchema = [
  { key: "platform", label: "Platform", type: "select", options: ["TikTok", "Instagram"], required: true },
  { key: "shooting", label: "Shooting", type: "checkbox" },
  { key: "publishedUrl", label: "Published URL", type: "url" },
  { key: "note", label: "Note", type: "text" },
];

describe("validateFields", () => {
  it("accepts valid input and fills nothing extra", () => {
    const r = validateFields(schema, { platform: "TikTok", shooting: true, publishedUrl: "https://x.com/a" });
    expect(r).toEqual({ ok: true, value: { platform: "TikTok", shooting: true, publishedUrl: "https://x.com/a" } });
  });
  it("rejects missing required", () => {
    const r = validateFields(schema, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(["platform"]);
  });
  it("rejects select value outside options", () => {
    const r = validateFields(schema, { platform: "Facebook" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.platform).toBeTruthy();
  });
  it("rejects unknown keys", () => {
    const r = validateFields(schema, { platform: "TikTok", bogus: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.bogus).toBeTruthy();
  });
  it("rejects non-http url and non-boolean checkbox", () => {
    const r = validateFields(schema, { platform: "TikTok", publishedUrl: "javascript:alert(1)", shooting: "yes" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["publishedUrl", "shooting"]);
  });
  it("treats empty optional strings as absent", () => {
    const r = validateFields(schema, { platform: "TikTok", publishedUrl: "", note: "" });
    expect(r).toEqual({ ok: true, value: { platform: "TikTok" } });
  });
  it("empty schema accepts {} and rejects any key", () => {
    expect(validateFields([], {}).ok).toBe(true);
    expect(validateFields([], { a: 1 }).ok).toBe(false);
  });
});

describe("validateFields hardening", () => {
  it("rejects __proto__ / constructor keys as unknown", () => {
    const withProto = JSON.parse('{"platform":"TikTok","__proto__":{"x":1}}');
    const r1 = validateFields(schema, withProto);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(Object.keys(r1.errors)).toContain("__proto__");
    const r2 = validateFields(schema, { platform: "TikTok", constructor: "x" });
    expect(r2.ok).toBe(false);
  });
  it("does not read inherited props for a schema key named constructor", () => {
    const r = validateFields([{ key: "constructor", label: "C", type: "text", required: true }], {});
    expect(r.ok).toBe(false);
  });
  it("select options are case-sensitive", () => {
    const r = validateFields(schema, { platform: "tiktok" });
    expect(r.ok).toBe(false);
  });
  it("rejects non-string for text and over-long text/url", () => {
    expect(validateFields(schema, { platform: "TikTok", note: 5 }).ok).toBe(false);
    expect(validateFields(schema, { platform: "TikTok", note: "x".repeat(5001) }).ok).toBe(false);
    expect(validateFields(schema, { platform: "TikTok", publishedUrl: "https://a.co/" + "x".repeat(5000) }).ok).toBe(false);
    expect(validateFields(schema, { platform: "TikTok", note: "x".repeat(5000) }).ok).toBe(true);
  });
});
