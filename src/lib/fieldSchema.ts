import { z } from "zod";

export const fieldDefSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "select", "checkbox", "url"]),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});
export const fieldSchemaSchema = z.array(fieldDefSchema);
export type FieldDef = z.infer<typeof fieldDefSchema>;
export type FieldSchema = FieldDef[];

/** Parses the Json column; a malformed schema is treated as "no extra fields". */
export function parseFieldSchema(raw: unknown): FieldSchema {
  const r = fieldSchemaSchema.safeParse(raw);
  return r.success ? r.data : [];
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

const MAX_TEXT = 5000;

export type FieldsResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> };

export function validateFields(schema: FieldSchema, fields: Record<string, unknown>): FieldsResult {
  const errors: Record<string, string> = {};
  const value: Record<string, unknown> = {};
  const known = new Set(schema.map((f) => f.key));
  for (const k of Object.keys(fields))
    // defineProperty so an own "__proto__" key is recorded as data instead of hitting the prototype setter.
    if (!known.has(k)) Object.defineProperty(errors, k, { value: "Unknown field", enumerable: true, configurable: true, writable: true });

  for (const f of schema) {
    const v = Object.hasOwn(fields, f.key) ? fields[f.key] : undefined;
    const blank = v === undefined || v === null || (typeof v === "string" && v.trim() === "");
    if (f.type === "checkbox") {
      if (v === undefined) {
        if (f.required) errors[f.key] = `${f.label} is required`;
      } else if (typeof v !== "boolean") errors[f.key] = `${f.label} must be true or false`;
      else value[f.key] = v;
      continue;
    }
    if (blank) {
      if (f.required) errors[f.key] = `${f.label} is required`;
      continue;
    }
    if (typeof v !== "string") {
      errors[f.key] = `${f.label} must be text`;
      continue;
    }
    const s = v.trim();
    if (s.length > MAX_TEXT) errors[f.key] = `${f.label} must be at most ${MAX_TEXT} characters`;
    else if (f.type === "select" && !(f.options ?? []).includes(s)) errors[f.key] = `${f.label} must be one of: ${(f.options ?? []).join(", ")}`;
    else if (f.type === "url" && !isHttpUrl(s)) errors[f.key] = `${f.label} must be an http(s) link`;
    else value[f.key] = s;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Builds the `fields` object from form data (keys prefixed `f_`) according to the schema. */
export function fieldsFromFormData(schema: FieldSchema, fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of schema) {
    const raw = fd.get(`f_${f.key}`);
    if (f.type === "checkbox") out[f.key] = raw !== null;
    else if (typeof raw === "string" && raw.trim() !== "") out[f.key] = raw;
  }
  return out;
}
