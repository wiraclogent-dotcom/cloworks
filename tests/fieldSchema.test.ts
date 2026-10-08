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
