import type { FieldDef, FieldSchema } from "./fieldSchema";

/**
 * Editing a request type's extra fields without JSON (spec 2026-10-23). The editor works on rows; `finalizeSchema`
 * turns them back into the stored `fieldSchema`. Keys are the link between a field and the answers stored on requests:
 * an existing field keeps its key whatever its label becomes, and a new field gets one generated from its label.
 */
export type FieldRow = { key: string | null; label: string; type: FieldDef["type"]; required: boolean; options: string[] };

export function rowsFromSchema(schema: FieldSchema): FieldRow[] {
  return schema.map((f) => ({ key: f.key, label: f.label, type: f.type, required: !!f.required, options: f.options ?? [] }));
}

const KEY_BASE_MAX = 38; // FIELD_KEY_RE allows 40; leaves room for a "2"…"99" suffix

/** camelCase of the label's ASCII letters and digits ("Content type" → contentType), unique among `taken`. */
export function fieldKeyFor(label: string, taken: ReadonlySet<string>): string {
  const words = label.match(/[A-Za-z0-9]+/g) ?? [];
  let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join("");
  if (!/^[A-Za-z]/.test(base)) base = `field${base ? base[0].toUpperCase() + base.slice(1) : ""}`;
  base = base.slice(0, KEY_BASE_MAX);
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}${n}`;
  return key;
}

const norm = (s: string) => s.trim().toLowerCase();

export function finalizeSchema(rows: FieldRow[]): { ok: true; schema: FieldSchema } | { ok: false; errors: Record<number, string> } {
  const errors: Record<number, string> = {};
  const labels = new Set<string>();
  rows.forEach((r, i) => {
    const label = norm(r.label);
    if (!label) errors[i] = "Label is required";
    else if (labels.has(label)) errors[i] = "Another field already uses this label";
    labels.add(label);
    if (errors[i] || r.type !== "select") return;
    const choices = r.options.map(norm).filter(Boolean);
    if (!choices.length) errors[i] = "Add at least one choice";
    else if (new Set(choices).size !== choices.length) errors[i] = "Choices must be different";
  });
  if (Object.keys(errors).length) return { ok: false, errors };

  const taken = new Set(rows.flatMap((r) => (r.key ? [r.key] : [])));
  const schema = rows.map((r): FieldDef => {
    let key = r.key;
    if (!key) taken.add((key = fieldKeyFor(r.label, taken)));
    const field: FieldDef = { key, label: r.label.trim(), type: r.type };
    if (r.type === "select") field.options = r.options.map((o) => o.trim()).filter(Boolean);
    if (r.required && r.type !== "checkbox") field.required = true;
    return field;
  });
  return { ok: true, schema };
}
